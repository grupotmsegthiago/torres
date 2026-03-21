import { eq, desc, or, sql } from "drizzle-orm";
import { db } from "./db";
import {
  users, clients, employees, vehicles, serviceOrders, trips,
  vehicleMaintenance, vehicleFueling, timesheets, missionPhotos, apiLogs, employeeSalaries,
  perfisAcesso, employeeDocuments, weapons, weaponAssignments, vehicleAssignments, weaponKits, weaponKitItems, gerenciadoras,
  telemetryEvents,
  type User, type InsertUser,
  type Client, type InsertClient,
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
  agentLocations,
  type AgentLocation, type InsertAgentLocation,
} from "@shared/schema";

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

  upsertAgentLocation(data: InsertAgentLocation): Promise<AgentLocation>;
  getAgentLocations(): Promise<AgentLocation[]>;
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(
      sql`LOWER(${users.email}) = LOWER(${email})`
    );
    return user;
  }

  async getUserBySupabaseUid(uid: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.supabaseUid, uid));
    return user;
  }

  async getUsers(): Promise<User[]> {
    return db.select().from(users).orderBy(users.id);
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
  }

  async updateUser(id: number, data: Partial<InsertUser>): Promise<User | undefined> {
    const [updated] = await db.update(users).set(data).where(eq(users.id, id)).returning();
    return updated;
  }

  async deleteUser(id: number): Promise<void> {
    await db.delete(users).where(eq(users.id, id));
  }

  async hasAnyUsers(): Promise<boolean> {
    const allUsers = await db.select({ id: users.id }).from(users);
    return allUsers.length > 0;
  }

  async createFirstAdmin(data: { supabaseUid: string; email: string; name: string }): Promise<User> {
    const result = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: users.id }).from(users);
      if (existing.length > 0) {
        throw new Error("Sistema já possui usuários cadastrados");
      }
      const [created] = await tx.insert(users).values({
        supabaseUid: data.supabaseUid,
        email: data.email.toLowerCase().trim(),
        name: data.name,
        role: "diretoria",
      }).returning();
      return created;
    });
    return result;
  }

  async getPerfilAcesso(role: string): Promise<PerfilAcesso | undefined> {
    const [perfil] = await db.select().from(perfisAcesso).where(eq(perfisAcesso.role, role));
    return perfil;
  }

  async getAllPerfis(): Promise<PerfilAcesso[]> {
    return db.select().from(perfisAcesso);
  }

  async getClients(): Promise<Client[]> {
    return db.select().from(clients).orderBy(desc(clients.createdAt));
  }

  async getClient(id: number): Promise<Client | undefined> {
    const [client] = await db.select().from(clients).where(eq(clients.id, id));
    return client;
  }

  async createClient(client: InsertClient): Promise<Client> {
    const [created] = await db.insert(clients).values(client).returning();
    return created;
  }

  async updateClient(id: number, client: Partial<InsertClient>): Promise<Client | undefined> {
    const [updated] = await db.update(clients).set(client).where(eq(clients.id, id)).returning();
    return updated;
  }

  async deleteClient(id: number): Promise<void> {
    await db.delete(clients).where(eq(clients.id, id));
  }

  async getEmployees(): Promise<Employee[]> {
    return db.select().from(employees).orderBy(desc(employees.createdAt));
  }

  async getEmployee(id: number): Promise<Employee | undefined> {
    const [emp] = await db.select().from(employees).where(eq(employees.id, id));
    return emp;
  }

  async createEmployee(employee: InsertEmployee): Promise<Employee> {
    const [created] = await db.insert(employees).values(employee).returning();
    return created;
  }

  async updateEmployee(id: number, employee: Partial<InsertEmployee>): Promise<Employee | undefined> {
    const [updated] = await db.update(employees).set(employee).where(eq(employees.id, id)).returning();
    return updated;
  }

  async deleteEmployee(id: number): Promise<void> {
    await db.delete(employees).where(eq(employees.id, id));
  }

  async getVehicles(): Promise<Vehicle[]> {
    return db.select().from(vehicles).orderBy(desc(vehicles.createdAt));
  }

  async getVehicle(id: number): Promise<Vehicle | undefined> {
    const [v] = await db.select().from(vehicles).where(eq(vehicles.id, id));
    return v;
  }

  async createVehicle(vehicle: InsertVehicle): Promise<Vehicle> {
    const [created] = await db.insert(vehicles).values(vehicle).returning();
    return created;
  }

  async updateVehicle(id: number, vehicle: Partial<InsertVehicle>): Promise<Vehicle | undefined> {
    const [updated] = await db.update(vehicles).set(vehicle).where(eq(vehicles.id, id)).returning();
    return updated;
  }

  async deleteVehicle(id: number): Promise<void> {
    await db.delete(vehicles).where(eq(vehicles.id, id));
  }

  async getServiceOrders(): Promise<ServiceOrder[]> {
    return db.select().from(serviceOrders).orderBy(desc(serviceOrders.createdAt));
  }

  async getServiceOrder(id: number): Promise<ServiceOrder | undefined> {
    const [so] = await db.select().from(serviceOrders).where(eq(serviceOrders.id, id));
    return so;
  }

  async createServiceOrder(order: InsertServiceOrder): Promise<ServiceOrder> {
    const [created] = await db.insert(serviceOrders).values(order).returning();
    return created;
  }

  async updateServiceOrder(id: number, order: Partial<InsertServiceOrder>): Promise<ServiceOrder | undefined> {
    const [updated] = await db.update(serviceOrders).set(order).where(eq(serviceOrders.id, id)).returning();
    return updated;
  }

  async deleteServiceOrder(id: number): Promise<void> {
    await db.delete(serviceOrders).where(eq(serviceOrders.id, id));
  }

  async getTrips(): Promise<Trip[]> {
    return db.select().from(trips).orderBy(desc(trips.createdAt));
  }

  async getTrip(id: number): Promise<Trip | undefined> {
    const [t] = await db.select().from(trips).where(eq(trips.id, id));
    return t;
  }

  async createTrip(trip: InsertTrip): Promise<Trip> {
    const [created] = await db.insert(trips).values(trip).returning();
    return created;
  }

  async updateTrip(id: number, trip: Partial<InsertTrip>): Promise<Trip | undefined> {
    const [updated] = await db.update(trips).set(trip).where(eq(trips.id, id)).returning();
    return updated;
  }

  async deleteTrip(id: number): Promise<void> {
    await db.delete(trips).where(eq(trips.id, id));
  }

  async getVehicleMaintenances(): Promise<VehicleMaintenance[]> {
    return db.select().from(vehicleMaintenance).orderBy(desc(vehicleMaintenance.createdAt));
  }

  async getVehicleMaintenance(id: number): Promise<VehicleMaintenance | undefined> {
    const [m] = await db.select().from(vehicleMaintenance).where(eq(vehicleMaintenance.id, id));
    return m;
  }

  async createVehicleMaintenance(m: InsertVehicleMaintenance): Promise<VehicleMaintenance> {
    const [created] = await db.insert(vehicleMaintenance).values(m).returning();
    return created;
  }

  async updateVehicleMaintenance(id: number, m: Partial<InsertVehicleMaintenance>): Promise<VehicleMaintenance | undefined> {
    const [updated] = await db.update(vehicleMaintenance).set(m).where(eq(vehicleMaintenance.id, id)).returning();
    return updated;
  }

  async deleteVehicleMaintenance(id: number): Promise<void> {
    await db.delete(vehicleMaintenance).where(eq(vehicleMaintenance.id, id));
  }

  async getVehicleFuelings(): Promise<VehicleFueling[]> {
    return db.select().from(vehicleFueling).orderBy(desc(vehicleFueling.createdAt));
  }

  async getVehicleFueling(id: number): Promise<VehicleFueling | undefined> {
    const [f] = await db.select().from(vehicleFueling).where(eq(vehicleFueling.id, id));
    return f;
  }

  async createVehicleFueling(f: InsertVehicleFueling): Promise<VehicleFueling> {
    const [created] = await db.insert(vehicleFueling).values(f).returning();
    return created;
  }

  async updateVehicleFueling(id: number, f: Partial<InsertVehicleFueling>): Promise<VehicleFueling | undefined> {
    const [updated] = await db.update(vehicleFueling).set(f).where(eq(vehicleFueling.id, id)).returning();
    return updated;
  }

  async deleteVehicleFueling(id: number): Promise<void> {
    await db.delete(vehicleFueling).where(eq(vehicleFueling.id, id));
  }

  async getTimesheets(): Promise<Timesheet[]> {
    return db.select().from(timesheets).orderBy(desc(timesheets.createdAt));
  }

  async getTimesheet(id: number): Promise<Timesheet | undefined> {
    const [t] = await db.select().from(timesheets).where(eq(timesheets.id, id));
    return t;
  }

  async createTimesheet(t: InsertTimesheet): Promise<Timesheet> {
    const [created] = await db.insert(timesheets).values(t).returning();
    return created;
  }

  async updateTimesheet(id: number, t: Partial<InsertTimesheet>): Promise<Timesheet | undefined> {
    const [updated] = await db.update(timesheets).set(t).where(eq(timesheets.id, id)).returning();
    return updated;
  }

  async deleteTimesheet(id: number): Promise<void> {
    await db.delete(timesheets).where(eq(timesheets.id, id));
  }

  async getMissionPhotosByOS(serviceOrderId: number): Promise<MissionPhoto[]> {
    return db.select().from(missionPhotos)
      .where(eq(missionPhotos.serviceOrderId, serviceOrderId))
      .orderBy(missionPhotos.createdAt);
  }

  async getMissionPhoto(id: number): Promise<MissionPhoto | undefined> {
    const [p] = await db.select().from(missionPhotos).where(eq(missionPhotos.id, id));
    return p;
  }

  async createMissionPhoto(photo: InsertMissionPhoto): Promise<MissionPhoto> {
    const [created] = await db.insert(missionPhotos).values(photo).returning();
    return created;
  }

  async getServiceOrdersByEmployee(employeeId: number): Promise<ServiceOrder[]> {
    return db.select().from(serviceOrders)
      .where(
        or(
          eq(serviceOrders.assignedEmployeeId, employeeId),
          eq(serviceOrders.assignedEmployee2Id, employeeId)
        )
      )
      .orderBy(desc(serviceOrders.createdAt));
  }

  async createApiLog(log: InsertApiLog): Promise<ApiLog> {
    const [created] = await db.insert(apiLogs).values(log).returning();
    return created;
  }

  async getRecentApiLogs(limit = 100): Promise<ApiLog[]> {
    return db.select().from(apiLogs).orderBy(desc(apiLogs.createdAt)).limit(limit);
  }

  async getEmployeeSalaries(employeeId: number): Promise<EmployeeSalary[]> {
    return db.select().from(employeeSalaries)
      .where(eq(employeeSalaries.employeeId, employeeId))
      .orderBy(desc(employeeSalaries.effectiveDate));
  }

  async createEmployeeSalary(salary: InsertEmployeeSalary): Promise<EmployeeSalary> {
    const [created] = await db.insert(employeeSalaries).values(salary).returning();
    return created;
  }

  async deleteEmployeeSalary(id: number): Promise<void> {
    await db.delete(employeeSalaries).where(eq(employeeSalaries.id, id));
  }

  async getNextMatricula(): Promise<string> {
    const result = await db.select().from(employees).orderBy(desc(employees.id)).limit(1);
    const nextId = result.length > 0 ? result[0].id + 1 : 1;
    return "TVP-" + String(nextId).padStart(4, "0");
  }

  async getEmployeeDocuments(employeeId: number): Promise<EmployeeDocument[]> {
    return db.select().from(employeeDocuments)
      .where(eq(employeeDocuments.employeeId, employeeId))
      .orderBy(desc(employeeDocuments.createdAt));
  }

  async createEmployeeDocument(doc: InsertEmployeeDocument): Promise<EmployeeDocument> {
    const [created] = await db.insert(employeeDocuments).values(doc).returning();
    return created;
  }

  async updateEmployeeDocument(id: number, doc: Partial<InsertEmployeeDocument>): Promise<EmployeeDocument | undefined> {
    const [updated] = await db.update(employeeDocuments).set(doc).where(eq(employeeDocuments.id, id)).returning();
    return updated;
  }

  async deleteEmployeeDocument(id: number): Promise<void> {
    await db.delete(employeeDocuments).where(eq(employeeDocuments.id, id));
  }

  async getWeapons(): Promise<Weapon[]> {
    return db.select().from(weapons).orderBy(desc(weapons.createdAt));
  }

  async getWeapon(id: number): Promise<Weapon | undefined> {
    const [w] = await db.select().from(weapons).where(eq(weapons.id, id));
    return w;
  }

  async createWeapon(weapon: InsertWeapon): Promise<Weapon> {
    const [created] = await db.insert(weapons).values(weapon).returning();
    return created;
  }

  async updateWeapon(id: number, weapon: Partial<InsertWeapon>): Promise<Weapon | undefined> {
    const [updated] = await db.update(weapons).set(weapon).where(eq(weapons.id, id)).returning();
    return updated;
  }

  async deleteWeapon(id: number): Promise<void> {
    await db.delete(weapons).where(eq(weapons.id, id));
  }

  async getWeaponAssignments(weaponId: number): Promise<WeaponAssignment[]> {
    return db.select().from(weaponAssignments)
      .where(eq(weaponAssignments.weaponId, weaponId))
      .orderBy(desc(weaponAssignments.createdAt));
  }

  async createWeaponAssignment(a: InsertWeaponAssignment): Promise<WeaponAssignment> {
    const [created] = await db.insert(weaponAssignments).values(a).returning();
    return created;
  }

  async getVehicleAssignments(vehicleId: number): Promise<VehicleAssignment[]> {
    return db.select().from(vehicleAssignments)
      .where(eq(vehicleAssignments.vehicleId, vehicleId))
      .orderBy(desc(vehicleAssignments.createdAt));
  }

  async createVehicleAssignment(a: InsertVehicleAssignment): Promise<VehicleAssignment> {
    const [created] = await db.insert(vehicleAssignments).values(a).returning();
    return created;
  }

  async getGerenciadoras(): Promise<Gerenciadora[]> {
    return db.select().from(gerenciadoras).orderBy(gerenciadoras.name);
  }

  async getGerenciadora(id: number): Promise<Gerenciadora | undefined> {
    const [g] = await db.select().from(gerenciadoras).where(eq(gerenciadoras.id, id));
    return g;
  }

  async createGerenciadora(g: InsertGerenciadora): Promise<Gerenciadora> {
    const [created] = await db.insert(gerenciadoras).values(g).returning();
    return created;
  }

  async updateGerenciadora(id: number, g: Partial<InsertGerenciadora>): Promise<Gerenciadora | undefined> {
    const [updated] = await db.update(gerenciadoras).set(g).where(eq(gerenciadoras.id, id)).returning();
    return updated;
  }

  async deleteGerenciadora(id: number): Promise<void> {
    await db.delete(gerenciadoras).where(eq(gerenciadoras.id, id));
  }

  async getWeaponKits(): Promise<WeaponKit[]> {
    return db.select().from(weaponKits).orderBy(weaponKits.name);
  }

  async getWeaponKit(id: number): Promise<WeaponKit | undefined> {
    const [k] = await db.select().from(weaponKits).where(eq(weaponKits.id, id));
    return k;
  }

  async createWeaponKit(kit: InsertWeaponKit): Promise<WeaponKit> {
    const [created] = await db.insert(weaponKits).values(kit).returning();
    return created;
  }

  async updateWeaponKit(id: number, kit: Partial<InsertWeaponKit>): Promise<WeaponKit | undefined> {
    const [updated] = await db.update(weaponKits).set(kit).where(eq(weaponKits.id, id)).returning();
    return updated;
  }

  async deleteWeaponKit(id: number): Promise<void> {
    await db.delete(weaponKitItems).where(eq(weaponKitItems.kitId, id));
    await db.delete(weaponKits).where(eq(weaponKits.id, id));
  }

  async getWeaponKitItems(kitId: number): Promise<WeaponKitItem[]> {
    return db.select().from(weaponKitItems).where(eq(weaponKitItems.kitId, kitId));
  }

  async createWeaponKitItem(item: InsertWeaponKitItem): Promise<WeaponKitItem> {
    const [created] = await db.insert(weaponKitItems).values(item).returning();
    return created;
  }

  async deleteWeaponKitItem(id: number): Promise<void> {
    await db.delete(weaponKitItems).where(eq(weaponKitItems.id, id));
  }

  async deleteWeaponKitItemsByKit(kitId: number): Promise<void> {
    await db.delete(weaponKitItems).where(eq(weaponKitItems.kitId, kitId));
  }

  async createTelemetryEvent(e: InsertTelemetryEvent): Promise<TelemetryEvent> {
    const [created] = await db.insert(telemetryEvents).values(e).returning();
    return created;
  }

  async getTelemetryEvents(filters?: { eventType?: string; plate?: string; from?: Date; to?: Date; limit?: number }): Promise<TelemetryEvent[]> {
    const conditions = [];
    if (filters?.eventType) conditions.push(eq(telemetryEvents.eventType, filters.eventType));
    if (filters?.plate) conditions.push(eq(telemetryEvents.plate, filters.plate));
    if (filters?.from) conditions.push(sql`${telemetryEvents.createdAt} >= ${filters.from}`);
    if (filters?.to) conditions.push(sql`${telemetryEvents.createdAt} <= ${filters.to}`);

    let query = db.select().from(telemetryEvents);
    if (conditions.length > 0) {
      query = query.where(sql`${sql.join(conditions, sql` AND `)}`) as any;
    }
    query = query.orderBy(desc(telemetryEvents.createdAt)) as any;
    if (filters?.limit) query = query.limit(filters.limit) as any;
    return query;
  }
  async upsertAgentLocation(data: InsertAgentLocation): Promise<AgentLocation> {
    const existing = await db.select().from(agentLocations).where(eq(agentLocations.userId, data.userId));
    if (existing.length > 0) {
      const [updated] = await db.update(agentLocations)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(agentLocations.userId, data.userId))
        .returning();
      return updated;
    }
    const [created] = await db.insert(agentLocations).values(data).returning();
    return created;
  }

  async getAgentLocations(): Promise<AgentLocation[]> {
    return db.select().from(agentLocations).orderBy(desc(agentLocations.updatedAt));
  }
}

export const storage = new DatabaseStorage();
