import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, timestamp, serial } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  supabaseUid: text("supabase_uid").unique(),
  email: text("email").unique(),
  username: text("username"),
  password: text("password"),
  name: text("name").notNull(),
  role: text("role").notNull().default("funcionario"),
  employeeId: integer("employee_id"),
  mustChangePassword: integer("must_change_password").default(0),
  avatarUrl: text("avatar_url"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

export const perfisAcesso = pgTable("perfis_acesso", {
  id: serial("id").primaryKey(),
  role: text("role").notNull().unique(),
  label: text("label").notNull(),
  permissions: text("permissions").notNull(),
});

export const insertPerfilAcessoSchema = createInsertSchema(perfisAcesso).omit({ id: true });
export type InsertPerfilAcesso = z.infer<typeof insertPerfilAcessoSchema>;
export type PerfilAcesso = typeof perfisAcesso.$inferSelect;

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
  matricula: text("matricula").notNull().unique(),
  name: text("name").notNull(),
  cpf: text("cpf").notNull(),
  rg: text("rg").notNull(),
  cnhNumber: text("cnh_number"),
  pis: text("pis"),
  role: text("role").notNull(),
  category: text("category").default("mensalista"),
  phone: text("phone"),
  email: text("email"),
  address: text("address"),
  birthDate: date("birth_date"),
  motherName: text("mother_name"),
  fatherName: text("father_name"),
  nationality: text("nationality"),
  maritalStatus: text("marital_status"),
  education: text("education"),
  hireDate: date("hire_date"),
  vacationExpiry: date("vacation_expiry"),
  sindicato: text("sindicato"),
  paymentMethod: text("payment_method").default("pix"),
  bankName: text("bank_name"),
  bankAgency: text("bank_agency"),
  bankAccount: text("bank_account"),
  pixKey: text("pix_key"),
  photoUrl: text("photo_url"),
  status: text("status").notNull().default("ativo"),
  cnhExpiry: date("cnh_expiry"),
  cnvNumber: text("cnv_number"),
  cnvExpiry: date("cnv_expiry"),
  vestNumber: text("vest_number"),
  vestBrand: text("vest_brand"),
  vestProtection: text("vest_protection"),
  vestExpiry: date("vest_expiry"),
  ammoCount: integer("ammo_count").default(0),
  blockType: text("block_type"),
  blockReason: text("block_reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSchema = createInsertSchema(employees).omit({ id: true, createdAt: true });
export type InsertEmployee = z.infer<typeof insertEmployeeSchema>;
export type Employee = typeof employees.$inferSelect;

export const employeeSalaries = pgTable("employee_salaries", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  baseSalary: decimal("base_salary", { precision: 10, scale: 2 }).notNull(),
  effectiveDate: date("effective_date").notNull(),
  reason: text("reason"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSalarySchema = createInsertSchema(employeeSalaries).omit({ id: true, createdAt: true });
export type InsertEmployeeSalary = z.infer<typeof insertEmployeeSalarySchema>;
export type EmployeeSalary = typeof employeeSalaries.$inferSelect;

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
  trackerType: text("tracker_type"),
  truckscontrolIdentifier: text("truckscontrol_identifier"),
  km: integer("km").default(0),
  frota: text("frota"),
  photoFront: text("photo_front"),
  photoLeft: text("photo_left"),
  photoRear: text("photo_rear"),
  photoRight: text("photo_right"),
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
  priority: text("priority").notNull().default("agendada"),
  scheduledDate: timestamp("scheduled_date"),
  completedDate: timestamp("completed_date"),
  assignedEmployeeId: integer("assigned_employee_id"),
  assignedEmployee2Id: integer("assigned_employee_2_id"),
  vehicleId: integer("vehicle_id"),
  missionStatus: text("mission_status").default("aguardando"),
  kitId: integer("kit_id"),
  escortedDriverName: text("escorted_driver_name"),
  escortedVehiclePlate: text("escorted_vehicle_plate"),
  missionStartedAt: timestamp("mission_started_at"),
  route: text("route"),
  requesterName: text("requester_name"),
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
  latitude: text("latitude"),
  longitude: text("longitude"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMissionPhotoSchema = createInsertSchema(missionPhotos).omit({ id: true, createdAt: true });
export type InsertMissionPhoto = z.infer<typeof insertMissionPhotoSchema>;
export type MissionPhoto = typeof missionPhotos.$inferSelect;

export const employeeDocuments = pgTable("employee_documents", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  type: text("type").notNull(),
  fileData: text("file_data"),
  fileName: text("file_name"),
  expiryDate: date("expiry_date"),
  issueDate: date("issue_date"),
  documentNumber: text("document_number"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeDocumentSchema = createInsertSchema(employeeDocuments).omit({ id: true, createdAt: true });
export type InsertEmployeeDocument = z.infer<typeof insertEmployeeDocumentSchema>;
export type EmployeeDocument = typeof employeeDocuments.$inferSelect;

export const weapons = pgTable("weapons", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  caliber: text("caliber").notNull(),
  serialNumber: text("serial_number").notNull().unique(),
  registrationNumber: text("registration_number"),
  registrationExpiry: date("registration_expiry"),
  registrationFileData: text("registration_file_data"),
  photoData: text("photo_data"),
  status: text("status").notNull().default("disponível"),
  assignedEmployeeId: integer("assigned_employee_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWeaponSchema = createInsertSchema(weapons).omit({ id: true, createdAt: true });
export type InsertWeapon = z.infer<typeof insertWeaponSchema>;
export type Weapon = typeof weapons.$inferSelect;

export const weaponAssignments = pgTable("weapon_assignments", {
  id: serial("id").primaryKey(),
  weaponId: integer("weapon_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  action: text("action").notNull(),
  serviceOrderId: integer("service_order_id"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWeaponAssignmentSchema = createInsertSchema(weaponAssignments).omit({ id: true, createdAt: true });
export type InsertWeaponAssignment = z.infer<typeof insertWeaponAssignmentSchema>;
export type WeaponAssignment = typeof weaponAssignments.$inferSelect;

export const vehicleAssignments = pgTable("vehicle_assignments", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id").notNull(),
  employeeId: integer("employee_id").notNull(),
  action: text("action").notNull(),
  serviceOrderId: integer("service_order_id"),
  kmAtAction: integer("km_at_action"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertVehicleAssignmentSchema = createInsertSchema(vehicleAssignments).omit({ id: true, createdAt: true });
export type InsertVehicleAssignment = z.infer<typeof insertVehicleAssignmentSchema>;
export type VehicleAssignment = typeof vehicleAssignments.$inferSelect;

export const weaponKits = pgTable("weapon_kits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  status: text("status").notNull().default("disponível"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWeaponKitSchema = createInsertSchema(weaponKits).omit({ id: true, createdAt: true });
export type InsertWeaponKit = z.infer<typeof insertWeaponKitSchema>;
export type WeaponKit = typeof weaponKits.$inferSelect;

export const weaponKitItems = pgTable("weapon_kit_items", {
  id: serial("id").primaryKey(),
  kitId: integer("kit_id").notNull(),
  weaponId: integer("weapon_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertWeaponKitItemSchema = createInsertSchema(weaponKitItems).omit({ id: true, createdAt: true });
export type InsertWeaponKitItem = z.infer<typeof insertWeaponKitItemSchema>;
export type WeaponKitItem = typeof weaponKitItems.$inferSelect;

export const gerenciadoras = pgTable("gerenciadoras", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  cnpj: text("cnpj"),
  apiUrl: text("api_url"),
  apiKey: text("api_key"),
  apiType: text("api_type").default("webhook"),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  active: integer("active").default(1),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGerenciadoraSchema = createInsertSchema(gerenciadoras).omit({ id: true, createdAt: true });
export type InsertGerenciadora = z.infer<typeof insertGerenciadoraSchema>;
export type Gerenciadora = typeof gerenciadoras.$inferSelect;

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
