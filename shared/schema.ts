import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  name: text("name").notNull(),
  role: text("role").notNull().default("admin"),
  employeeId: integer("employee_id"),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const clients = pgTable("clients", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  cpf: text("cpf"),
  email: text("email"),
  phone: text("phone"),
  contactPerson: text("contact_person"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  zip: text("zip"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientSchema = createInsertSchema(clients).omit({ id: true, createdAt: true });
export type InsertClient = z.infer<typeof insertClientSchema>;
export type Client = typeof clients.$inferSelect;

export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cpf: text("cpf"),
  rg: text("rg"),
  cnhNumber: text("cnh_number"),
  role: text("role").notNull(),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  hireDate: date("hire_date"),
  status: text("status").notNull().default("ativo"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const vehicles = pgTable("vehicles", {
  id: serial("id").primaryKey(),
  plate: text("plate").notNull(),
  model: text("model").notNull(),
  brand: text("brand").notNull(),
  year: integer("year"),
  color: text("color"),
  chassi: text("chassi"),
  renavam: text("renavam"),
  status: text("status").notNull().default("disponível"),
  trackerId: text("tracker_id"),
  trackerApiUrl: text("tracker_api_url"),
  km: integer("km").default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true });
export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;

export const serviceOrders = pgTable("service_orders", {
  id: serial("id").primaryKey(),
  osNumber: text("os_number").notNull().unique(),
  clientId: integer("client_id").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  status: text("status").notNull().default("aberta"),
  priority: text("priority").notNull().default("normal"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  assignedEmployeeId: integer("assigned_employee_id"),
  assignedEmployee2Id: integer("assigned_employee_2_id"),
  vehicleId: integer("vehicle_id"),
  missionStatus: text("mission_status").default("aguardando"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({ id: true, createdAt: true });
export type InsertServiceOrder = z.infer<typeof insertServiceOrderSchema>;
export type ServiceOrder = typeof serviceOrders.$inferSelect;

export const trips = pgTable("trips", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id"),
  vehicleId: integer("vehicle_id").notNull(),
  driverId: integer("driver_id").notNull(),
  origin: text("origin").notNull(),
  destination: text("destination").notNull(),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  kmStart: integer("km_start"),
  kmEnd: integer("km_end"),
  status: text("status").notNull().default("planejada"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;

export const vehicleMaintenance = pgTable("vehicle_maintenance", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  type: text("type").notNull(),
  description: text("description"),
  date: date("date").notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  km: integer("km"),
  nextMaintenanceKm: integer("next_maintenance_km"),
  nextMaintenanceDate: date("next_maintenance_date"),
  provider: text("provider"),
  status: text("status").notNull().default("realizada"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleMaintenanceSchema = createInsertSchema(vehicleMaintenance).omit({ id: true, createdAt: true });
export type InsertVehicleMaintenance = z.infer<typeof insertVehicleMaintenanceSchema>;
export type VehicleMaintenance = typeof vehicleMaintenance.$inferSelect;

export const vehicleFueling = pgTable("vehicle_fueling", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  driverId: integer("driver_id"),
  date: date("date").notNull(),
  liters: decimal("liters", { precision: 10, scale: 2 }).notNull(),
  costPerLiter: decimal("cost_per_liter", { precision: 10, scale: 2 }),
  totalCost: decimal("total_cost", { precision: 10, scale: 2 }),
  km: integer("km").notNull(),
  fuelType: text("fuel_type").notNull().default("diesel"),
  station: text("station"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleFuelingSchema = createInsertSchema(vehicleFueling).omit({ id: true, createdAt: true });
export type InsertVehicleFueling = z.infer<typeof insertVehicleFuelingSchema>;
export type VehicleFueling = typeof vehicleFueling.$inferSelect;

export const timesheets = pgTable("timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  date: date("date").notNull(),
  checkIn: text("check_in"),
  checkOutLunch: text("check_out_lunch"),
  checkInLunch: text("check_in_lunch"),
  checkOut: text("check_out"),
  hoursWorked: decimal("hours_worked", { precision: 5, scale: 2 }),
  overtime: decimal("overtime", { precision: 5, scale: 2 }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTimesheetSchema = createInsertSchema(timesheets).omit({ id: true, createdAt: true });
export type InsertTimesheet = z.infer<typeof insertTimesheetSchema>;
export type Timesheet = typeof timesheets.$inferSelect;

export const missionPhotos = pgTable("mission_photos", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  step: text("step").notNull(),
  photoData: text("photo_data").notNull(),
  kmValue: integer("km_value"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMissionPhotoSchema = createInsertSchema(missionPhotos).omit({ id: true, createdAt: true });
export type InsertMissionPhoto = z.infer<typeof insertMissionPhotoSchema>;
export type MissionPhoto = typeof missionPhotos.$inferSelect;

export const apiLogs = pgTable("api_logs", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  method: text("method").notNull().default("GET"),
  requestData: text("request_data"),
  responseStatus: integer("response_status"),
  responseData: text("response_data"),
  userId: integer("user_id"),
  source: text("source").default("manual"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertApiLogSchema = createInsertSchema(apiLogs).omit({ id: true, createdAt: true });
export type InsertApiLog = z.infer<typeof insertApiLogSchema>;
export type ApiLog = typeof apiLogs.$inferSelect;
