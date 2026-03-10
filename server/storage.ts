import { eq, desc, or } from "drizzle-orm";
import { db } from "./db";
import {
  users, clients, employees, vehicles, serviceOrders, trips,
  vehicleMaintenance, vehicleFueling, timesheets, missionPhotos, apiLogs,
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
} from "@shared/schema";

export interface IStorage {
  getUser(id: number): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: number): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(user: InsertUser): Promise<User> {
    const [created] = await db.insert(users).values(user).returning();
    return created;
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
}

export const storage = new DatabaseStorage();
