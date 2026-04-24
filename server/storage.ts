import { supabaseAdmin } from "./supabase";
import {
  type User, type InsertUser,
  type Client, type InsertClient,
  type ClientVehicle, type InsertClientVehicle,
  type Employee, type InsertEmployee,
  type Vehicle, type InsertVehicle,
  type ServiceOrder, type InsertServiceOrder,
  type Trip, type InsertTrip,
  type VehicleMaintenance, type InsertVehicleMaintenance,
  type VehicleFueling, type InsertVehicleFueling,
  type Timesheet, type InsertTimesheet,
  type MissionPhoto, type InsertMissionPhoto,
  type ApiLog, type InsertApiLog,
  type EmployeeSalary, type InsertEmployeeSalary,
  type PerfilAcesso,
  type EmployeeDocument, type InsertEmployeeDocument,
  type Weapon, type InsertWeapon,
  type WeaponAssignment, type InsertWeaponAssignment,
  type VehicleAssignment, type InsertVehicleAssignment,
  type WeaponKit, type InsertWeaponKit,
  type WeaponKitItem, type InsertWeaponKitItem,
  type Gerenciadora, type InsertGerenciadora,
  type TelemetryEvent, type InsertTelemetryEvent,
  type AgentLocation, type InsertAgentLocation,
  type MissionCost, type InsertMissionCost,
  type ClientForward, type InsertClientForward,
} from "@shared/schema";
import { localQuery, localQuerySingle, cacheTableIfOnline, isSupabaseHealthy, syncAllTables, enqueueWrite, applyViaDirectSql } from "./pg-fallback";
import pg from "pg";

let _directPool: pg.Pool | null = null;
function getDirectPool(): pg.Pool {
  if (!_directPool) {
    const supabaseDbUrl = process.env.SUPABASE_DATABASE_URL;
    if (supabaseDbUrl) {
      _directPool = new pg.Pool({
        connectionString: supabaseDbUrl,
        ssl: { rejectUnauthorized: false },
        max: 3,
        idleTimeoutMillis: 20_000,
        connectionTimeoutMillis: 10_000,
      });
      console.log("[storage] getDirectPool usando SUPABASE_DATABASE_URL (banco primário)");
    } else {
      _directPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 5_000 });
      console.warn("[storage] SUPABASE_DATABASE_URL ausente — caindo para DATABASE_URL local (não recomendado)");
    }
  }
  return _directPool;
}
function isSchemaCacheError(msg: string): boolean {
  return /schema cache/i.test(msg) && /Could not find/i.test(msg);
}

const LOCAL_CACHE_TTL_MS = 45_000;
const localCacheAge = new Map<string, number>();

function isLocalFresh(table: string): boolean {
  const lastSync = localCacheAge.get(table) || 0;
  return Date.now() - lastSync < LOCAL_CACHE_TTL_MS;
}

function markLocalFresh(table: string): void {
  localCacheAge.set(table, Date.now());
}

const MEM_CACHE_TTL_MS = 120_000;
const memCache = new Map<string, { data: any; ts: number }>();

export function memGet<T>(key: string): T[] | null {
  const entry = memCache.get(key);
  if (entry && Date.now() - entry.ts < MEM_CACHE_TTL_MS) return entry.data;
  return null;
}

export function memSet<T>(key: string, data: T[]): void {
  memCache.set(key, { data, ts: Date.now() });
}

export function memInvalidate(key: string): void {
  memCache.delete(key);
}

export function memInvalidateAll(): void {
  memCache.clear();
}

async function resilientList<T>(
  table: string,
  supaFn: () => Promise<{ data: any[] | null; error: any }>,
  orderCol?: string,
  orderAsc?: boolean,
  filters?: { column: string; op: string; value: any }[],
): Promise<T[]> {
  if (!isSupabaseHealthy() && isLocalFresh(table)) {
    const local = await localQuery(
      table,
      filters,
      orderCol ? { column: orderCol, ascending: orderAsc } : undefined,
    );
    if (local.length > 0) return local.map((r) => toCamelObj<T>(r));
  }

  try {
    const { data, error } = await supaFn();
    if (error) throw error;
    markLocalFresh(table);
    return toCamelArray<T>(data || []);
  } catch (err: any) {
    console.warn(`[resilient] ${table} list fallback: ${err.message || err}`);
    const local = await localQuery(
      table,
      filters,
      orderCol ? { column: orderCol, ascending: orderAsc } : undefined,
    );
    return local.map((r) => toCamelObj<T>(r));
  }
}

async function resilientGet<T>(
  table: string,
  filters: { column: string; op: string; value: any }[],
  supaFn: () => Promise<{ data: any | null; error: any }>,
): Promise<T | undefined> {
  if (!isSupabaseHealthy() && isLocalFresh(table)) {
    const rows = await localQuery(table, filters, undefined, 1);
    if (rows.length > 0) return toCamelObj<T>(rows[0]);
  }

  try {
    const { data, error } = await supaFn();
    if (error && error.code !== "PGRST116") throw error;
    markLocalFresh(table);
    return data ? toCamelObj<T>(data) : undefined;
  } catch (err: any) {
    console.warn(`[resilient] ${table} get fallback: ${err.message || err}`);
    const rows = await localQuery(table, filters, undefined, 1);
    return rows.length > 0 ? toCamelObj<T>(rows[0]) : undefined;
  }
}

async function resilientInsert<T>(
  table: string,
  snakePayload: Record<string, any>,
): Promise<T> {
  try {
    const { data, error } = await supabaseAdmin.from(table).insert(snakePayload).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<T>(data);
  } catch (err: any) {
    console.warn(`[resilient] ${table} insert fallback to queue: ${err.message}`);
    const { queueId } = await enqueueWrite(table, "insert", snakePayload);
    return { ...toCamelObj<T>(snakePayload as any), _queued: true, _queueId: queueId } as any;
  }
}

async function resilientUpdate<T>(
  table: string,
  snakePayload: Record<string, any>,
  filters: Record<string, any>,
): Promise<T | undefined> {
  try {
    let query = supabaseAdmin.from(table).update(snakePayload);
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { data, error } = await query.select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<T>(data) : undefined;
  } catch (err: any) {
    if (isSchemaCacheError(err.message || "")) {
      try {
        await applyViaDirectSql(getDirectPool(), "update", table, snakePayload, filters);
        console.log(`[resilient] ${table} update aplicado via SQL direto (cache do PostgREST desatualizado)`);
        try { await supabaseAdmin.rpc("pg_notify", { channel: "pgrst", payload: "reload schema" }); } catch (_e) {}
        return toCamelObj<T>({ ...snakePayload, ...filters } as any);
      } catch (sqlErr: any) {
        console.error(`[resilient] ${table} SQL direto também falhou: ${sqlErr.message}`);
      }
    }
    console.warn(`[resilient] ${table} update fallback to queue: ${err.message}`);
    await enqueueWrite(table, "update", snakePayload, filters);
    return toCamelObj<T>({ ...snakePayload, ...filters } as any);
  }
}

async function resilientDelete(
  table: string,
  filters: Record<string, any>,
): Promise<void> {
  try {
    let query = supabaseAdmin.from(table).delete();
    for (const [col, val] of Object.entries(filters)) {
      query = query.eq(col, val);
    }
    const { error } = await query;
    if (error) throw new Error(error.message);
  } catch (err: any) {
    console.warn(`[resilient] ${table} delete fallback to queue: ${err.message}`);
    await enqueueWrite(table, "delete", {}, filters);
  }
}

function camelToSnake(str: string): string {
  return str
    .replace(/([a-z])(\d)/g, "$1_$2")
    .replace(/(\d)([A-Z])/g, "$1_$2")
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .toLowerCase();
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
}

export function toSnakeObj(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    out[camelToSnake(k)] = v;
  }
  return out;
}

export function toCamelObj<T = any>(obj: Record<string, any>): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[snakeToCamel(k)] = v;
  }
  return out as T;
}

export function toCamelArray<T = any>(arr: any[]): T[] {
  return arr.map((r) => toCamelObj<T>(r));
}

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserBySupabaseUid(uid: string): Promise<User | undefined>;
  getUsers(): Promise<User[]>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined>;
  deleteUser(id: number): Promise<void>;
  hasAnyUsers(): Promise<boolean>;
  createFirstAdmin(data: { supabaseUid: string; email: string; name: string }): Promise<User>;
  getPerfilAcesso(role: string): Promise<PerfilAcesso | undefined>;
  getAllPerfis(): Promise<PerfilAcesso[]>;

  getClients(): Promise<Client[]>;
  getClient(id: number): Promise<Client | undefined>;
  createClient(client: InsertClient): Promise<Client>;
  updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined>;
  deleteClient(id: number): Promise<void>;

  getClientVehicles(clientId: number): Promise<ClientVehicle[]>;
  getClientVehicle(id: number): Promise<ClientVehicle | undefined>;
  getClientVehicleByPlate(clientId: number, plate: string): Promise<ClientVehicle | undefined>;
  createClientVehicle(v: InsertClientVehicle): Promise<ClientVehicle>;
  updateClientVehicle(id: number, v: Partial<InsertClientVehicle>): Promise<ClientVehicle | undefined>;
  deleteClientVehicle(id: number): Promise<void>;

  getEmployees(): Promise<Employee[]>;
  getEmployee(id: number): Promise<Employee | undefined>;
  createEmployee(employee: InsertEmployee): Promise<Employee>;
  updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined>;
  deleteEmployee(id: number): Promise<void>;

  getVehicles(): Promise<Vehicle[]>;
  getVehicle(id: number): Promise<Vehicle | undefined>;
  createVehicle(vehicle: InsertVehicle): Promise<Vehicle>;
  updateVehicle(id: number, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined>;
  deleteVehicle(id: number): Promise<void>;

  getServiceOrders(): Promise<ServiceOrder[]>;
  getServiceOrder(id: number): Promise<ServiceOrder | undefined>;
  createServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder>;
  updateServiceOrder(id: number, order: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined>;
  deleteServiceOrder(id: number): Promise<void>;

  getTrips(): Promise<Trip[]>;
  getTrip(id: number): Promise<Trip | undefined>;
  createTrip(trip: InsertTrip): Promise<Trip>;
  updateTrip(id: number, trip: Partial<InsertTrip>): Promise<Trip | undefined>;
  deleteTrip(id: number): Promise<void>;

  getVehicleMaintenances(): Promise<VehicleMaintenance[]>;
  getVehicleMaintenance(id: number): Promise<VehicleMaintenance | undefined>;
  createVehicleMaintenance(m: InsertVehicleMaintenance): Promise<VehicleMaintenance>;
  updateVehicleMaintenance(id: number, m: Partial<InsertVehicleMaintenance>): Promise<VehicleMaintenance | undefined>;
  deleteVehicleMaintenance(id: number): Promise<void>;

  getVehicleFuelings(): Promise<VehicleFueling[]>;
  getVehicleFueling(id: number): Promise<VehicleFueling | undefined>;
  createVehicleFueling(f: InsertVehicleFueling): Promise<VehicleFueling>;
  updateVehicleFueling(id: number, f: Partial<InsertVehicleFueling>): Promise<VehicleFueling | undefined>;
  deleteVehicleFueling(id: number): Promise<void>;

  getTimesheets(): Promise<Timesheet[]>;
  getTimesheet(id: number): Promise<Timesheet | undefined>;
  createTimesheet(t: InsertTimesheet): Promise<Timesheet>;
  updateTimesheet(id: number, t: Partial<InsertTimesheet>): Promise<Timesheet | undefined>;
  deleteTimesheet(id: number): Promise<void>;

  getMissionPhotosByOS(serviceOrderId: number): Promise<MissionPhoto[]>;
  getMissionPhoto(id: number): Promise<MissionPhoto | undefined>;
  createMissionPhoto(photo: InsertMissionPhoto): Promise<MissionPhoto>;
  getServiceOrdersByEmployee(employeeId: number): Promise<ServiceOrder[]>;

  createApiLog(log: InsertApiLog): Promise<ApiLog | null>;
  getRecentApiLogs(limit?: number): Promise<ApiLog[]>;

  getEmployeeSalaries(employeeId: number): Promise<EmployeeSalary[]>;
  createEmployeeSalary(salary: InsertEmployeeSalary): Promise<EmployeeSalary>;
  deleteEmployeeSalary(id: number): Promise<void>;
  getNextMatricula(): Promise<string>;

  getEmployeeDocuments(employeeId: number): Promise<EmployeeDocument[]>;
  createEmployeeDocument(doc: InsertEmployeeDocument): Promise<EmployeeDocument>;
  updateEmployeeDocument(id: number, doc: Partial<InsertEmployeeDocument>): Promise<EmployeeDocument | undefined>;
  deleteEmployeeDocument(id: number): Promise<void>;

  getWeapons(): Promise<Weapon[]>;
  getWeapon(id: number): Promise<Weapon | undefined>;
  createWeapon(weapon: InsertWeapon): Promise<Weapon>;
  updateWeapon(id: number, weapon: Partial<InsertWeapon>): Promise<Weapon | undefined>;
  deleteWeapon(id: number): Promise<void>;
  getWeaponAssignments(weaponId: number): Promise<WeaponAssignment[]>;
  createWeaponAssignment(a: InsertWeaponAssignment): Promise<WeaponAssignment>;

  getVehicleAssignments(vehicleId: number): Promise<VehicleAssignment[]>;
  createVehicleAssignment(a: InsertVehicleAssignment): Promise<VehicleAssignment>;

  getWeaponKits(): Promise<WeaponKit[]>;
  getWeaponKit(id: number): Promise<WeaponKit | undefined>;
  createWeaponKit(kit: InsertWeaponKit): Promise<WeaponKit>;
  updateWeaponKit(id: number, kit: Partial<InsertWeaponKit>): Promise<WeaponKit | undefined>;
  deleteWeaponKit(id: number): Promise<void>;
  getWeaponKitItems(kitId: number): Promise<WeaponKitItem[]>;
  createWeaponKitItem(item: InsertWeaponKitItem): Promise<WeaponKitItem>;
  deleteWeaponKitItem(id: number): Promise<void>;
  deleteWeaponKitItemsByKit(kitId: number): Promise<void>;

  getGerenciadoras(): Promise<Gerenciadora[]>;
  getGerenciadora(id: number): Promise<Gerenciadora | undefined>;
  createGerenciadora(g: InsertGerenciadora): Promise<Gerenciadora>;
  updateGerenciadora(id: number, g: Partial<InsertGerenciadora>): Promise<Gerenciadora | undefined>;
  deleteGerenciadora(id: number): Promise<void>;

  createTelemetryEvent(e: InsertTelemetryEvent): Promise<TelemetryEvent>;
  getTelemetryEvents(filters?: { eventType?: string; plate?: string; from?: Date; to?: Date; limit?: number }): Promise<TelemetryEvent[]>;
  getLastAlertByPlates(plates: string[]): Promise<Map<string, TelemetryEvent>>;

  upsertAgentLocation(data: InsertAgentLocation): Promise<AgentLocation>;
  getAgentLocations(): Promise<AgentLocation[]>;

  getMissionCostsByOS(serviceOrderId: number): Promise<MissionCost[]>;
  createMissionCost(cost: InsertMissionCost): Promise<MissionCost>;
  deleteMissionCost(id: number): Promise<void>;

  getClientForwardsByOS(serviceOrderId: number): Promise<ClientForward[]>;
  createClientForward(forward: InsertClientForward): Promise<ClientForward>;
}

export class DatabaseStorage implements IStorage {

  async getUser(id: number): Promise<User | undefined> {
    return resilientGet<User>("users", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("users").select("*").eq("id", id).single());
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    return resilientGet<User>("users", [{ column: "email", op: "ilike", value: email.toLowerCase() }], () =>
      supabaseAdmin.from("users").select("*").ilike("email", email).single());
  }

  async getUserBySupabaseUid(uid: string): Promise<User | undefined> {
    return resilientGet<User>("users", [{ column: "supabase_uid", op: "eq", value: uid }], () =>
      supabaseAdmin.from("users").select("*").eq("supabase_uid", uid).single());
  }

  async getUsers(): Promise<User[]> {
    return resilientList<User>("users", () =>
      supabaseAdmin.from("users").select("*").order("id"), "id", true);
  }

  async createUser(user: InsertUser): Promise<User> {
    return resilientInsert<User>("users", toSnakeObj(user as any));
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    return resilientUpdate<User>("users", toSnakeObj(userData as any), { id });
  }

  async deleteUser(id: number): Promise<void> {
    return resilientDelete("users", { id });
  }

  async hasAnyUsers(): Promise<boolean> {
    const { data, error } = await supabaseAdmin.from("users").select("id").limit(1);
    if (error) return true;
    return (data || []).length > 0;
  }

  async createFirstAdmin(adminData: { supabaseUid: string; email: string; name: string }): Promise<User> {
    const { data: existing } = await supabaseAdmin.from("users").select("id").limit(1);
    if (existing && existing.length > 0) {
      throw new Error("Sistema já possui usuários cadastrados");
    }
    const { data, error } = await supabaseAdmin.from("users").insert({
      supabase_uid: adminData.supabaseUid,
      email: adminData.email.toLowerCase().trim(),
      name: adminData.name,
      role: "diretoria",
    }).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<User>(data);
  }

  async getPerfilAcesso(role: string): Promise<PerfilAcesso | undefined> {
    return resilientGet<PerfilAcesso>("perfis_acesso", [{ column: "role", op: "eq", value: role }], () =>
      supabaseAdmin.from("perfis_acesso").select("*").eq("role", role).single());
  }

  async getAllPerfis(): Promise<PerfilAcesso[]> {
    return resilientList<PerfilAcesso>("perfis_acesso", () =>
      supabaseAdmin.from("perfis_acesso").select("*"));
  }

  async getClients(): Promise<Client[]> {
    const cached = memGet<Client>("clients");
    if (cached) return cached;
    const result = await resilientList<Client>("clients", () =>
      supabaseAdmin.from("clients").select("*").order("created_at", { ascending: false }), "created_at", false);
    memSet("clients", result);
    return result;
  }

  async getClient(id: number): Promise<Client | undefined> {
    return resilientGet<Client>("clients", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("clients").select("*").eq("id", id).single());
  }

  async createClient(client: InsertClient): Promise<Client> {
    memInvalidate("clients");
    return resilientInsert<Client>("clients", toSnakeObj(client as any));
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined> {
    memInvalidate("clients");
    return resilientUpdate<Client>("clients", toSnakeObj(client as any), { id });
  }

  async deleteClient(id: number): Promise<void> {
    memInvalidate("clients");
    return resilientDelete("clients", { id });
  }

  async getClientVehicles(clientId: number): Promise<ClientVehicle[]> {
    return resilientList<ClientVehicle>("client_vehicles", () =>
      supabaseAdmin.from("client_vehicles").select("*").eq("client_id", clientId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "client_id", op: "eq", value: clientId }]);
  }

  async getClientVehicle(id: number): Promise<ClientVehicle | undefined> {
    return resilientGet<ClientVehicle>("client_vehicles", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("client_vehicles").select("*").eq("id", id).single());
  }

  async getClientVehicleByPlate(clientId: number, plate: string): Promise<ClientVehicle | undefined> {
    return resilientGet<ClientVehicle>("client_vehicles", [{ column: "client_id", op: "eq", value: clientId }, { column: "plate", op: "ilike", value: plate }], () =>
      supabaseAdmin.from("client_vehicles").select("*").eq("client_id", clientId).ilike("plate", plate).single());
  }

  async createClientVehicle(v: InsertClientVehicle): Promise<ClientVehicle> {
    return resilientInsert<ClientVehicle>("client_vehicles", toSnakeObj(v as any));
  }

  async updateClientVehicle(id: number, v: Partial<InsertClientVehicle>): Promise<ClientVehicle | undefined> {
    return resilientUpdate<ClientVehicle>("client_vehicles", toSnakeObj(v as any), { id });
  }

  async deleteClientVehicle(id: number): Promise<void> {
    return resilientDelete("client_vehicles", { id });
  }

  async getEmployees(): Promise<Employee[]> {
    const cached = memGet<Employee>("employees");
    if (cached) return cached;
    const result = await resilientList<Employee>("employees", () =>
      supabaseAdmin.from("employees").select("*").order("created_at", { ascending: false }), "created_at", false);
    memSet("employees", result);
    return result;
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    return resilientGet<Employee>("employees", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("employees").select("*").eq("id", id).single());
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    memInvalidate("employees");
    return resilientInsert<Employee>("employees", toSnakeObj(employee as any));
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    memInvalidate("employees");
    return resilientUpdate<Employee>("employees", toSnakeObj(employee as any), { id });
  }

  async deleteEmployee(id: number): Promise<void> {
    memInvalidate("employees");
    return resilientDelete("employees", { id });
  }

  async getVehicles(): Promise<Vehicle[]> {
    const cached = memGet<Vehicle>("vehicles");
    if (cached) return cached;
    const result = await resilientList<Vehicle>("vehicles", () =>
      supabaseAdmin.from("vehicles").select("*").order("created_at", { ascending: false }), "created_at", false);
    memSet("vehicles", result);
    return result;
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    return resilientGet<Vehicle>("vehicles", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("vehicles").select("*").eq("id", id).single());
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    memInvalidate("vehicles");
    return resilientInsert<Vehicle>("vehicles", toSnakeObj(vehicle as any));
  }

  async updateVehicle(id: number, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    memInvalidate("vehicles");
    return resilientUpdate<Vehicle>("vehicles", toSnakeObj(vehicle as any), { id });
  }

  async deleteVehicle(id: number): Promise<void> {
    memInvalidate("vehicles");
    return resilientDelete("vehicles", { id });
  }

  async getServiceOrders(): Promise<ServiceOrder[]> {
    return resilientList<ServiceOrder>("service_orders", () =>
      supabaseAdmin.from("service_orders").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getServiceOrder(id: number): Promise<ServiceOrder | undefined> {
    return resilientGet<ServiceOrder>("service_orders", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("service_orders").select("*").eq("id", id).single());
  }

  async createServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder> {
    return resilientInsert<ServiceOrder>("service_orders", toSnakeObj(order as any));
  }

  async updateServiceOrder(id: number, order: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined> {
    return resilientUpdate<ServiceOrder>("service_orders", toSnakeObj(order as any), { id });
  }

  async deleteServiceOrder(id: number): Promise<void> {
    return resilientDelete("service_orders", { id });
  }

  async getTrips(): Promise<Trip[]> {
    return resilientList<Trip>("trips", () =>
      supabaseAdmin.from("trips").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    return resilientGet<Trip>("trips", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("trips").select("*").eq("id", id).single());
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    return resilientInsert<Trip>("trips", toSnakeObj(trip as any));
  }

  async updateTrip(id: number, trip: Partial<InsertTrip>): Promise<Trip | undefined> {
    return resilientUpdate<Trip>("trips", toSnakeObj(trip as any), { id });
  }

  async deleteTrip(id: number): Promise<void> {
    return resilientDelete("trips", { id });
  }

  async getVehicleMaintenances(): Promise<VehicleMaintenance[]> {
    return resilientList<VehicleMaintenance>("vehicle_maintenance", () =>
      supabaseAdmin.from("vehicle_maintenance").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getVehicleMaintenance(id: number): Promise<VehicleMaintenance | undefined> {
    return resilientGet<VehicleMaintenance>("vehicle_maintenance", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("vehicle_maintenance").select("*").eq("id", id).single());
  }

  async createVehicleMaintenance(m: InsertVehicleMaintenance): Promise<VehicleMaintenance> {
    return resilientInsert<VehicleMaintenance>("vehicle_maintenance", toSnakeObj(m as any));
  }

  async updateVehicleMaintenance(id: number, m: Partial<InsertVehicleMaintenance>): Promise<VehicleMaintenance | undefined> {
    return resilientUpdate<VehicleMaintenance>("vehicle_maintenance", toSnakeObj(m as any), { id });
  }

  async deleteVehicleMaintenance(id: number): Promise<void> {
    return resilientDelete("vehicle_maintenance", { id });
  }

  async getVehicleFuelings(): Promise<VehicleFueling[]> {
    return resilientList<VehicleFueling>("vehicle_fueling", () =>
      supabaseAdmin.from("vehicle_fueling").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getVehicleFueling(id: number): Promise<VehicleFueling | undefined> {
    return resilientGet<VehicleFueling>("vehicle_fueling", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("vehicle_fueling").select("*").eq("id", id).single());
  }

  async createVehicleFueling(f: InsertVehicleFueling): Promise<VehicleFueling> {
    return resilientInsert<VehicleFueling>("vehicle_fueling", toSnakeObj(f as any));
  }

  async updateVehicleFueling(id: number, f: Partial<InsertVehicleFueling>): Promise<VehicleFueling | undefined> {
    return resilientUpdate<VehicleFueling>("vehicle_fueling", toSnakeObj(f as any), { id });
  }

  async deleteVehicleFueling(id: number): Promise<void> {
    return resilientDelete("vehicle_fueling", { id });
  }

  async getTimesheets(): Promise<Timesheet[]> {
    return resilientList<Timesheet>("timesheets", () =>
      supabaseAdmin.from("timesheets").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getTimesheet(id: number): Promise<Timesheet | undefined> {
    return resilientGet<Timesheet>("timesheets", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("timesheets").select("*").eq("id", id).single());
  }

  async createTimesheet(t: InsertTimesheet): Promise<Timesheet> {
    return resilientInsert<Timesheet>("timesheets", toSnakeObj(t as any));
  }

  async updateTimesheet(id: number, t: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    return resilientUpdate<Timesheet>("timesheets", toSnakeObj(t as any), { id });
  }

  async deleteTimesheet(id: number): Promise<void> {
    return resilientDelete("employee_timesheets", { id });
  }

  async getMissionPhotosByOS(serviceOrderId: number): Promise<MissionPhoto[]> {
    return resilientList<MissionPhoto>("mission_photos", () =>
      supabaseAdmin.from("mission_photos").select("*").eq("service_order_id", serviceOrderId).order("created_at"), "created_at", true,
      [{ column: "service_order_id", op: "eq", value: serviceOrderId }]);
  }

  async getMissionPhoto(id: number): Promise<MissionPhoto | undefined> {
    return resilientGet<MissionPhoto>("mission_photos", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("mission_photos").select("*").eq("id", id).single());
  }

  async createMissionPhoto(photo: InsertMissionPhoto): Promise<MissionPhoto> {
    const { data, error } = await supabaseAdmin.from("mission_photos").insert(toSnakeObj(photo as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<MissionPhoto>(data);
  }

  async getServiceOrdersByEmployee(employeeId: number): Promise<ServiceOrder[]> {
    try {
      const { data, error } = await supabaseAdmin.from("service_orders").select("*").or(`assigned_employee_id.eq.${employeeId},assigned_employee_2_id.eq.${employeeId}`).order("created_at", { ascending: false });
      if (error) throw error;
      return toCamelArray<ServiceOrder>(data || []);
    } catch (err: any) {
      console.warn(`[resilient] service_orders by employee fallback: ${err.message || err}`);
      const all = await localQuery("service_orders", undefined, { column: "created_at", ascending: false });
      return all
        .filter((r: any) => Number(r.assigned_employee_id) === employeeId || Number(r.assigned_employee_2_id) === employeeId)
        .map((r) => toCamelObj<ServiceOrder>(r));
    }
  }

  async createApiLog(logEntry: InsertApiLog): Promise<ApiLog | null> {
    try {
      const { data, error } = await supabaseAdmin.from("api_logs").insert(toSnakeObj(logEntry as any)).select().single();
      if (error) { console.error("[api_logs] insert error:", error.message); return null; }
      return toCamelObj<ApiLog>(data);
    } catch (e: any) {
      console.error("[api_logs] unexpected error:", e.message);
      return null;
    }
  }

  async getRecentApiLogs(limit = 100): Promise<ApiLog[]> {
    return resilientList<ApiLog>("api_logs", () =>
      supabaseAdmin.from("api_logs").select("*").order("created_at", { ascending: false }).limit(limit), "created_at", false);
  }

  async getEmployeeSalaries(employeeId: number): Promise<EmployeeSalary[]> {
    return resilientList<EmployeeSalary>("employee_salaries", () =>
      supabaseAdmin.from("employee_salaries").select("*").eq("employee_id", employeeId).order("effective_date", { ascending: false }), "effective_date", false,
      [{ column: "employee_id", op: "eq", value: employeeId }]);
  }

  async createEmployeeSalary(salary: InsertEmployeeSalary): Promise<EmployeeSalary> {
    return resilientInsert<EmployeeSalary>("employee_salaries", toSnakeObj(salary as any));
  }

  async deleteEmployeeSalary(id: number): Promise<void> {
    return resilientDelete("employee_salaries", { id });
  }

  async getNextMatricula(): Promise<string> {
    const { data } = await supabaseAdmin.from("employees").select("id").order("id", { ascending: false }).limit(1);
    const nextId = data && data.length > 0 ? data[0].id + 1 : 1;
    return "TVP-" + String(nextId).padStart(4, "0");
  }

  async getEmployeeDocuments(employeeId: number): Promise<EmployeeDocument[]> {
    return resilientList<EmployeeDocument>("employee_documents", () =>
      supabaseAdmin.from("employee_documents").select("*").eq("employee_id", employeeId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "employee_id", op: "eq", value: employeeId }]);
  }

  async createEmployeeDocument(doc: InsertEmployeeDocument): Promise<EmployeeDocument> {
    return resilientInsert<EmployeeDocument>("employee_documents", toSnakeObj(doc as any));
  }

  async updateEmployeeDocument(id: number, doc: Partial<InsertEmployeeDocument>): Promise<EmployeeDocument | undefined> {
    return resilientUpdate<EmployeeDocument>("employee_documents", toSnakeObj(doc as any), { id });
  }

  async deleteEmployeeDocument(id: number): Promise<void> {
    return resilientDelete("employee_documents", { id });
  }

  async getWeapons(): Promise<Weapon[]> {
    return resilientList<Weapon>("weapons", () =>
      supabaseAdmin.from("weapons").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getWeapon(id: number): Promise<Weapon | undefined> {
    return resilientGet<Weapon>("weapons", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("weapons").select("*").eq("id", id).single());
  }

  async createWeapon(weapon: InsertWeapon): Promise<Weapon> {
    return resilientInsert<Weapon>("weapons", toSnakeObj(weapon as any));
  }

  async updateWeapon(id: number, weapon: Partial<InsertWeapon>): Promise<Weapon | undefined> {
    return resilientUpdate<Weapon>("weapons", toSnakeObj(weapon as any), { id });
  }

  async deleteWeapon(id: number): Promise<void> {
    return resilientDelete("weapons", { id });
  }

  async getWeaponAssignments(weaponId: number): Promise<WeaponAssignment[]> {
    return resilientList<WeaponAssignment>("weapon_assignments", () =>
      supabaseAdmin.from("weapon_assignments").select("*").eq("weapon_id", weaponId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "weapon_id", op: "eq", value: weaponId }]);
  }

  async createWeaponAssignment(a: InsertWeaponAssignment): Promise<WeaponAssignment> {
    return resilientInsert<WeaponAssignment>("weapon_assignments", toSnakeObj(a as any));
  }

  async getVehicleAssignments(vehicleId: number): Promise<VehicleAssignment[]> {
    return resilientList<VehicleAssignment>("vehicle_assignments", () =>
      supabaseAdmin.from("vehicle_assignments").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "vehicle_id", op: "eq", value: vehicleId }]);
  }

  async createVehicleAssignment(a: InsertVehicleAssignment): Promise<VehicleAssignment> {
    return resilientInsert<VehicleAssignment>("vehicle_assignments", toSnakeObj(a as any));
  }

  async getGerenciadoras(): Promise<Gerenciadora[]> {
    return resilientList<Gerenciadora>("gerenciadoras", () =>
      supabaseAdmin.from("gerenciadoras").select("*").order("name"), "name", true);
  }

  async getGerenciadora(id: number): Promise<Gerenciadora | undefined> {
    return resilientGet<Gerenciadora>("gerenciadoras", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("gerenciadoras").select("*").eq("id", id).single());
  }

  async createGerenciadora(g: InsertGerenciadora): Promise<Gerenciadora> {
    return resilientInsert<Gerenciadora>("gerenciadoras", toSnakeObj(g as any));
  }

  async updateGerenciadora(id: number, g: Partial<InsertGerenciadora>): Promise<Gerenciadora | undefined> {
    return resilientUpdate<Gerenciadora>("gerenciadoras", toSnakeObj(g as any), { id });
  }

  async deleteGerenciadora(id: number): Promise<void> {
    return resilientDelete("gerenciadoras", { id });
  }

  async getWeaponKits(): Promise<WeaponKit[]> {
    return resilientList<WeaponKit>("weapon_kits", () =>
      supabaseAdmin.from("weapon_kits").select("*").order("name"), "name", true);
  }

  async getWeaponKit(id: number): Promise<WeaponKit | undefined> {
    return resilientGet<WeaponKit>("weapon_kits", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("weapon_kits").select("*").eq("id", id).single());
  }

  async createWeaponKit(kit: InsertWeaponKit): Promise<WeaponKit> {
    return resilientInsert<WeaponKit>("weapon_kits", toSnakeObj(kit as any));
  }

  async updateWeaponKit(id: number, kit: Partial<InsertWeaponKit>): Promise<WeaponKit | undefined> {
    return resilientUpdate<WeaponKit>("weapon_kits", toSnakeObj(kit as any), { id });
  }

  async deleteWeaponKit(id: number): Promise<void> {
    await resilientDelete("weapon_kit_items", { kit_id: id });
    await resilientDelete("weapon_kits", { id });
  }

  async getWeaponKitItems(kitId: number): Promise<WeaponKitItem[]> {
    return resilientList<WeaponKitItem>("weapon_kit_items", () =>
      supabaseAdmin.from("weapon_kit_items").select("*").eq("kit_id", kitId), undefined, undefined,
      [{ column: "kit_id", op: "eq", value: kitId }]);
  }

  async createWeaponKitItem(item: InsertWeaponKitItem): Promise<WeaponKitItem> {
    return resilientInsert<WeaponKitItem>("weapon_kit_items", toSnakeObj(item as any));
  }

  async deleteWeaponKitItem(id: number): Promise<void> {
    return resilientDelete("weapon_kit_items", { id });
  }

  async deleteWeaponKitItemsByKit(kitId: number): Promise<void> {
    return resilientDelete("weapon_kit_items", { kit_id: kitId });
  }

  async createTelemetryEvent(e: InsertTelemetryEvent): Promise<TelemetryEvent> {
    return resilientInsert<TelemetryEvent>("telemetry_events", toSnakeObj(e as any));
  }

  async getTelemetryEvents(filters?: { eventType?: string; plate?: string; from?: Date; to?: Date; limit?: number }): Promise<TelemetryEvent[]> {
    try {
      let query = supabaseAdmin.from("telemetry_events").select("*");
      if (filters?.eventType) query = query.eq("event_type", filters.eventType);
      if (filters?.plate) query = query.eq("plate", filters.plate);
      if (filters?.from) query = query.gte("created_at", filters.from.toISOString());
      if (filters?.to) query = query.lte("created_at", filters.to.toISOString());
      query = query.order("created_at", { ascending: false });
      if (filters?.limit) query = query.limit(filters.limit);
      const { data, error } = await query;
      if (error) throw error;
      return toCamelArray<TelemetryEvent>(data || []);
    } catch (err: any) {
      console.warn(`[resilient] telemetry_events fallback: ${err.message || err}`);
      const localFilters: Array<{ column: string; op: string; value: any }> = [];
      if (filters?.eventType) localFilters.push({ column: "event_type", op: "eq", value: filters.eventType });
      if (filters?.plate) localFilters.push({ column: "plate", op: "eq", value: filters.plate });
      if (filters?.from) localFilters.push({ column: "created_at", op: "gte", value: filters.from.toISOString() });
      if (filters?.to) localFilters.push({ column: "created_at", op: "lte", value: filters.to.toISOString() });
      const local = await localQuery("telemetry_events", localFilters.length > 0 ? localFilters : undefined, { column: "created_at", ascending: false }, filters?.limit);
      return local.map((r) => toCamelObj<TelemetryEvent>(r));
    }
  }

  async getLastAlertByPlates(plates: string[]): Promise<Map<string, TelemetryEvent>> {
    const result = new Map<string, TelemetryEvent>();
    if (plates.length === 0) return result;
    const { data } = await supabaseAdmin.from("telemetry_events").select("*").in("plate", plates).order("created_at", { ascending: false });
    for (const row of (data || [])) {
      const camel = toCamelObj<TelemetryEvent>(row);
      if (!result.has(camel.plate)) {
        result.set(camel.plate, camel);
      }
    }
    return result;
  }

  async upsertAgentLocation(data: InsertAgentLocation): Promise<AgentLocation> {
    const payload = toSnakeObj(data as any);
    payload.updated_at = new Date().toISOString();
    try {
      const { data: result, error } = await supabaseAdmin
        .from("agent_locations")
        .upsert(payload, { onConflict: "user_id" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return toCamelObj<AgentLocation>(result);
    } catch (err: any) {
      console.warn(`[resilient] agent_locations upsert fallback: ${err.message}`);
      await enqueueWrite("agent_locations", "insert", payload);
      return toCamelObj<AgentLocation>(payload as any);
    }
  }

  async getAgentLocations(): Promise<AgentLocation[]> {
    return resilientList<AgentLocation>("agent_locations", () =>
      supabaseAdmin.from("agent_locations").select("*").order("updated_at", { ascending: false }), "updated_at", false);
  }

  async getMissionCostsByOS(serviceOrderId: number): Promise<MissionCost[]> {
    return resilientList<MissionCost>("mission_costs", () =>
      supabaseAdmin.from("mission_costs").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "service_order_id", op: "eq", value: serviceOrderId }]);
  }

  async createMissionCost(cost: InsertMissionCost): Promise<MissionCost> {
    return resilientInsert<MissionCost>("mission_costs", toSnakeObj(cost as any));
  }

  async deleteMissionCost(id: number): Promise<void> {
    return resilientDelete("mission_costs", { id });
  }

  async getClientForwardsByOS(serviceOrderId: number): Promise<ClientForward[]> {
    return resilientList<ClientForward>("client_forwards", () =>
      supabaseAdmin.from("client_forwards").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "service_order_id", op: "eq", value: serviceOrderId }]);
  }

  async createClientForward(forward: InsertClientForward): Promise<ClientForward> {
    return resilientInsert<ClientForward>("client_forwards", toSnakeObj(forward as any));
  }
}

export const storage = new DatabaseStorage();
