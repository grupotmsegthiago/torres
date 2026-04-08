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
import { localQuery, localQuerySingle, cacheTableIfOnline, isSupabaseHealthy, syncAllTables } from "./pg-fallback";

async function resilientList<T>(
  table: string,
  supaFn: () => Promise<{ data: any[] | null; error: any }>,
  orderCol?: string,
  orderAsc?: boolean,
  filters?: { column: string; op: string; value: any }[],
): Promise<T[]> {
  try {
    const { data, error } = await supaFn();
    if (error) throw error;
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
  try {
    const { data, error } = await supaFn();
    if (error && error.code !== "PGRST116") throw error;
    return data ? toCamelObj<T>(data) : undefined;
  } catch (err: any) {
    console.warn(`[resilient] ${table} get fallback: ${err.message || err}`);
    const rows = await localQuery(table, filters, undefined, 1);
    return rows.length > 0 ? toCamelObj<T>(rows[0]) : undefined;
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

  createApiLog(log: InsertApiLog): Promise<ApiLog>;
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
    const { data, error } = await supabaseAdmin.from("users").insert(toSnakeObj(user as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<User>(data);
  }

  async updateUser(id: number, userData: Partial<InsertUser>): Promise<User | undefined> {
    const { data, error } = await supabaseAdmin.from("users").update(toSnakeObj(userData as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<User>(data) : undefined;
  }

  async deleteUser(id: number): Promise<void> {
    await supabaseAdmin.from("users").delete().eq("id", id);
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
    return resilientList<Client>("clients", () =>
      supabaseAdmin.from("clients").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getClient(id: number): Promise<Client | undefined> {
    return resilientGet<Client>("clients", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("clients").select("*").eq("id", id).single());
  }

  async createClient(client: InsertClient): Promise<Client> {
    const { data, error } = await supabaseAdmin.from("clients").insert(toSnakeObj(client as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Client>(data);
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined> {
    const { data, error } = await supabaseAdmin.from("clients").update(toSnakeObj(client as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Client>(data) : undefined;
  }

  async deleteClient(id: number): Promise<void> {
    await supabaseAdmin.from("clients").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("client_vehicles").insert(toSnakeObj(v as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<ClientVehicle>(data);
  }

  async updateClientVehicle(id: number, v: Partial<InsertClientVehicle>): Promise<ClientVehicle | undefined> {
    const { data, error } = await supabaseAdmin.from("client_vehicles").update(toSnakeObj(v as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<ClientVehicle>(data) : undefined;
  }

  async deleteClientVehicle(id: number): Promise<void> {
    await supabaseAdmin.from("client_vehicles").delete().eq("id", id);
  }

  async getEmployees(): Promise<Employee[]> {
    return resilientList<Employee>("employees", () =>
      supabaseAdmin.from("employees").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    return resilientGet<Employee>("employees", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("employees").select("*").eq("id", id).single());
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const { data, error } = await supabaseAdmin.from("employees").insert(toSnakeObj(employee as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Employee>(data);
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const { data, error } = await supabaseAdmin.from("employees").update(toSnakeObj(employee as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Employee>(data) : undefined;
  }

  async deleteEmployee(id: number): Promise<void> {
    await supabaseAdmin.from("employees").delete().eq("id", id);
  }

  async getVehicles(): Promise<Vehicle[]> {
    return resilientList<Vehicle>("vehicles", () =>
      supabaseAdmin.from("vehicles").select("*").order("created_at", { ascending: false }), "created_at", false);
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    return resilientGet<Vehicle>("vehicles", [{ column: "id", op: "eq", value: id }], () =>
      supabaseAdmin.from("vehicles").select("*").eq("id", id).single());
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const { data, error } = await supabaseAdmin.from("vehicles").insert(toSnakeObj(vehicle as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Vehicle>(data);
  }

  async updateVehicle(id: number, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const { data, error } = await supabaseAdmin.from("vehicles").update(toSnakeObj(vehicle as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Vehicle>(data) : undefined;
  }

  async deleteVehicle(id: number): Promise<void> {
    await supabaseAdmin.from("vehicles").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("service_orders").insert(toSnakeObj(order as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<ServiceOrder>(data);
  }

  async updateServiceOrder(id: number, order: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined> {
    const { data, error } = await supabaseAdmin.from("service_orders").update(toSnakeObj(order as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<ServiceOrder>(data) : undefined;
  }

  async deleteServiceOrder(id: number): Promise<void> {
    await supabaseAdmin.from("service_orders").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("trips").insert(toSnakeObj(trip as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Trip>(data);
  }

  async updateTrip(id: number, trip: Partial<InsertTrip>): Promise<Trip | undefined> {
    const { data, error } = await supabaseAdmin.from("trips").update(toSnakeObj(trip as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Trip>(data) : undefined;
  }

  async deleteTrip(id: number): Promise<void> {
    await supabaseAdmin.from("trips").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("vehicle_maintenance").insert(toSnakeObj(m as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<VehicleMaintenance>(data);
  }

  async updateVehicleMaintenance(id: number, m: Partial<InsertVehicleMaintenance>): Promise<VehicleMaintenance | undefined> {
    const { data, error } = await supabaseAdmin.from("vehicle_maintenance").update(toSnakeObj(m as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<VehicleMaintenance>(data) : undefined;
  }

  async deleteVehicleMaintenance(id: number): Promise<void> {
    await supabaseAdmin.from("vehicle_maintenance").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("vehicle_fueling").insert(toSnakeObj(f as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<VehicleFueling>(data);
  }

  async updateVehicleFueling(id: number, f: Partial<InsertVehicleFueling>): Promise<VehicleFueling | undefined> {
    const { data, error } = await supabaseAdmin.from("vehicle_fueling").update(toSnakeObj(f as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<VehicleFueling>(data) : undefined;
  }

  async deleteVehicleFueling(id: number): Promise<void> {
    await supabaseAdmin.from("vehicle_fueling").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("timesheets").insert(toSnakeObj(t as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Timesheet>(data);
  }

  async updateTimesheet(id: number, t: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    const { data, error } = await supabaseAdmin.from("timesheets").update(toSnakeObj(t as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Timesheet>(data) : undefined;
  }

  async deleteTimesheet(id: number): Promise<void> {
    await supabaseAdmin.from("employee_timesheets").delete().eq("id", id);
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

  async createApiLog(logEntry: InsertApiLog): Promise<ApiLog> {
    const { data, error } = await supabaseAdmin.from("api_logs").insert(toSnakeObj(logEntry as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<ApiLog>(data);
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
    const { data, error } = await supabaseAdmin.from("employee_salaries").insert(toSnakeObj(salary as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<EmployeeSalary>(data);
  }

  async deleteEmployeeSalary(id: number): Promise<void> {
    await supabaseAdmin.from("employee_salaries").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("employee_documents").insert(toSnakeObj(doc as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<EmployeeDocument>(data);
  }

  async updateEmployeeDocument(id: number, doc: Partial<InsertEmployeeDocument>): Promise<EmployeeDocument | undefined> {
    const { data, error } = await supabaseAdmin.from("employee_documents").update(toSnakeObj(doc as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<EmployeeDocument>(data) : undefined;
  }

  async deleteEmployeeDocument(id: number): Promise<void> {
    await supabaseAdmin.from("employee_documents").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("weapons").insert(toSnakeObj(weapon as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Weapon>(data);
  }

  async updateWeapon(id: number, weapon: Partial<InsertWeapon>): Promise<Weapon | undefined> {
    const { data, error } = await supabaseAdmin.from("weapons").update(toSnakeObj(weapon as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Weapon>(data) : undefined;
  }

  async deleteWeapon(id: number): Promise<void> {
    await supabaseAdmin.from("weapons").delete().eq("id", id);
  }

  async getWeaponAssignments(weaponId: number): Promise<WeaponAssignment[]> {
    return resilientList<WeaponAssignment>("weapon_assignments", () =>
      supabaseAdmin.from("weapon_assignments").select("*").eq("weapon_id", weaponId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "weapon_id", op: "eq", value: weaponId }]);
  }

  async createWeaponAssignment(a: InsertWeaponAssignment): Promise<WeaponAssignment> {
    const { data, error } = await supabaseAdmin.from("weapon_assignments").insert(toSnakeObj(a as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<WeaponAssignment>(data);
  }

  async getVehicleAssignments(vehicleId: number): Promise<VehicleAssignment[]> {
    return resilientList<VehicleAssignment>("vehicle_assignments", () =>
      supabaseAdmin.from("vehicle_assignments").select("*").eq("vehicle_id", vehicleId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "vehicle_id", op: "eq", value: vehicleId }]);
  }

  async createVehicleAssignment(a: InsertVehicleAssignment): Promise<VehicleAssignment> {
    const { data, error } = await supabaseAdmin.from("vehicle_assignments").insert(toSnakeObj(a as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<VehicleAssignment>(data);
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
    const { data, error } = await supabaseAdmin.from("gerenciadoras").insert(toSnakeObj(g as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<Gerenciadora>(data);
  }

  async updateGerenciadora(id: number, g: Partial<InsertGerenciadora>): Promise<Gerenciadora | undefined> {
    const { data, error } = await supabaseAdmin.from("gerenciadoras").update(toSnakeObj(g as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<Gerenciadora>(data) : undefined;
  }

  async deleteGerenciadora(id: number): Promise<void> {
    await supabaseAdmin.from("gerenciadoras").delete().eq("id", id);
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
    const { data, error } = await supabaseAdmin.from("weapon_kits").insert(toSnakeObj(kit as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<WeaponKit>(data);
  }

  async updateWeaponKit(id: number, kit: Partial<InsertWeaponKit>): Promise<WeaponKit | undefined> {
    const { data, error } = await supabaseAdmin.from("weapon_kits").update(toSnakeObj(kit as any)).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data ? toCamelObj<WeaponKit>(data) : undefined;
  }

  async deleteWeaponKit(id: number): Promise<void> {
    await supabaseAdmin.from("weapon_kit_items").delete().eq("kit_id", id);
    await supabaseAdmin.from("weapon_kits").delete().eq("id", id);
  }

  async getWeaponKitItems(kitId: number): Promise<WeaponKitItem[]> {
    return resilientList<WeaponKitItem>("weapon_kit_items", () =>
      supabaseAdmin.from("weapon_kit_items").select("*").eq("kit_id", kitId), undefined, undefined,
      [{ column: "kit_id", op: "eq", value: kitId }]);
  }

  async createWeaponKitItem(item: InsertWeaponKitItem): Promise<WeaponKitItem> {
    const { data, error } = await supabaseAdmin.from("weapon_kit_items").insert(toSnakeObj(item as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<WeaponKitItem>(data);
  }

  async deleteWeaponKitItem(id: number): Promise<void> {
    await supabaseAdmin.from("weapon_kit_items").delete().eq("id", id);
  }

  async deleteWeaponKitItemsByKit(kitId: number): Promise<void> {
    await supabaseAdmin.from("weapon_kit_items").delete().eq("kit_id", kitId);
  }

  async createTelemetryEvent(e: InsertTelemetryEvent): Promise<TelemetryEvent> {
    const { data, error } = await supabaseAdmin.from("telemetry_events").insert(toSnakeObj(e as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<TelemetryEvent>(data);
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
    const { data: existing } = await supabaseAdmin.from("agent_locations").select("id").eq("user_id", (data as any).userId).limit(1);
    if (existing && existing.length > 0) {
      const payload = toSnakeObj(data as any);
      payload.updated_at = new Date().toISOString();
      const { data: updated, error } = await supabaseAdmin.from("agent_locations").update(payload).eq("user_id", (data as any).userId).select().single();
      if (error) throw new Error(error.message);
      return toCamelObj<AgentLocation>(updated);
    }
    const { data: created, error } = await supabaseAdmin.from("agent_locations").insert(toSnakeObj(data as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<AgentLocation>(created);
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
    const { data, error } = await supabaseAdmin.from("mission_costs").insert(toSnakeObj(cost as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<MissionCost>(data);
  }

  async deleteMissionCost(id: number): Promise<void> {
    await supabaseAdmin.from("mission_costs").delete().eq("id", id);
  }

  async getClientForwardsByOS(serviceOrderId: number): Promise<ClientForward[]> {
    return resilientList<ClientForward>("client_forwards", () =>
      supabaseAdmin.from("client_forwards").select("*").eq("service_order_id", serviceOrderId).order("created_at", { ascending: false }), "created_at", false,
      [{ column: "service_order_id", op: "eq", value: serviceOrderId }]);
  }

  async createClientForward(forward: InsertClientForward): Promise<ClientForward> {
    const { data, error } = await supabaseAdmin.from("client_forwards").insert(toSnakeObj(forward as any)).select().single();
    if (error) throw new Error(error.message);
    return toCamelObj<ClientForward>(data);
  }
}

export const storage = new DatabaseStorage();
