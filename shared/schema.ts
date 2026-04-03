import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, decimal, date, timestamp, serial, real, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  supabaseUid: text("supabase_uid").unique(),
  email: text("email").unique(),
  username: text("username"),
  name: text("name").notNull(),
  role: text("role").notNull().default("funcionario"),
  employeeId: integer("employee_id"),
  mustChangePassword: integer("must_change_password").default(0),
  termsAcceptedAt: timestamp("terms_accepted_at"),
  termsIpAddress: text("terms_ip_address"),
  termsUserAgent: text("terms_user_agent"),
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
  emailOperacional: text("email_operacional"),
  emailFinanceiro: text("email_financeiro"),
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

export const clientVehicles = pgTable("client_vehicles", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull().references(() => clients.id),
  plate: text("plate").notNull(),
  model: text("model"),
  brand: text("brand"),
  color: text("color"),
  driverName: text("driver_name"),
  driverPhone: text("driver_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientVehicleSchema = createInsertSchema(clientVehicles).omit({ id: true, createdAt: true });
export type InsertClientVehicle = z.infer<typeof insertClientVehicleSchema>;
export type ClientVehicle = typeof clientVehicles.$inferSelect;

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
  addressLat: real("address_lat"),
  addressLng: real("address_lng"),
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
  documentFile: text("document_file"),
  status: text("status").notNull().default("disponível"),
  trackerId: text("tracker_id"),
  trackerApiUrl: text("tracker_api_url"),
  trackerType: text("tracker_type"),
  truckscontrolIdentifier: text("truckscontrol_identifier"),
  km: integer("km").default(0),
  initialKm: integer("initial_km").default(0),
  lastKmUpdate: timestamp("last_km_update"),
  frota: text("frota"),
  photoFront: text("photo_front"),
  photoLeft: text("photo_left"),
  photoRear: text("photo_rear"),
  photoRight: text("photo_right"),
  iconType: text("icon_type").default("polo"),
  lastLatitude: text("last_latitude"),
  lastLongitude: text("last_longitude"),
  lastIgnition: integer("last_ignition"),
  lastSpeed: integer("last_speed"),
  lastGpsSignal: integer("last_gps_signal"),
  lastAddress: text("last_address"),
  lastPositionTime: text("last_position_time"),
  stoppedSince: text("stopped_since"),
  ignitionOnSince: text("ignition_on_since"),
  noSignalSince: text("no_signal_since"),
  lastOilChangeKm: integer("last_oil_change_km"),
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
  escortedDriverPhone: text("escorted_driver_phone"),
  escortedVehiclePlate: text("escorted_vehicle_plate"),
  missionStartedAt: timestamp("mission_started_at"),
  route: text("route"),
  origin: text("origin"),
  originLat: real("origin_lat"),
  originLng: real("origin_lng"),
  destination: text("destination"),
  destinationLat: real("destination_lat"),
  destinationLng: real("destination_lng"),
  requesterName: text("requester_name"),
  notes: text("notes"),
  baseReturnKm: text("base_return_km"),
  baseCleanStatus: text("base_clean_status"),
  baseCleanNotes: text("base_clean_notes"),
  baseChecklistConfirmed: boolean("base_checklist_confirmed"),
  earlyStartApproved: boolean("early_start_approved").default(false),
  escortContractId: text("escort_contract_id"),
  valorEstimado: real("valor_estimado"),
  pedagioEstimado: real("pedagio_estimado"),
  fuelAllocated: boolean("fuel_allocated"),
  stepLogs: jsonb("step_logs").default([]),
  waypoints: jsonb("waypoints").default([]),
  createdByUserId: integer("created_by_user_id"),
  createdAt: timestamp("created_at").defaultNow(),
});

const coerceDate = z.preprocess(
  (val) => (val === null || val === undefined || val === "" ? null : val),
  z.union([z.coerce.date(), z.null()])
).optional();
const coerceReal = z.preprocess(
  (val) => {
    if (val === null || val === undefined || val === "") return null;
    const n = Number(String(val).replace(",", "."));
    return isNaN(n) ? null : n;
  },
  z.union([z.number(), z.null()])
).optional();
export const insertServiceOrderSchema = createInsertSchema(serviceOrders).omit({ id: true, createdAt: true }).extend({
  scheduledDate: coerceDate,
  completedDate: coerceDate,
  missionStartedAt: coerceDate,
  valorEstimado: coerceReal,
  pedagioEstimado: coerceReal,
});
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
  fullTank: boolean("full_tank").default(true),
  station: text("station"),
  receiptPhoto: text("receipt_photo"),
  pumpPhoto: text("pump_photo"),
  odometerPhoto: text("odometer_photo"),
  notes: text("notes"),
  platePhoto: text("plate_photo"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  address: text("address"),
  gasolinePrice: decimal("gasoline_price", { precision: 10, scale: 3 }),
  ethanolPrice: decimal("ethanol_price", { precision: 10, scale: 3 }),
  fuelRecommendation: text("fuel_recommendation"),
  recommendationFollowed: boolean("recommendation_followed"),
  createdByUserId: integer("created_by_user_id"),
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
  checkOutDate: date("check_out_date"),
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
  tcPermissaoComando: integer("tc_permissao_comando").default(1),
  tcIE: integer("tc_ie").default(0),
  tcTIE: integer("tc_tie").default(0),
  tcValidade: text("tc_validade"),
  tcPossoCancelar: integer("tc_posso_cancelar").default(1),
  tcComandoExclusivo: integer("tc_comando_exclusivo").default(0),
  tcCompartilharDados: integer("tc_compartilhar_dados").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertGerenciadoraSchema = createInsertSchema(gerenciadoras).omit({ id: true, createdAt: true });
export type InsertGerenciadora = z.infer<typeof insertGerenciadoraSchema>;
export type Gerenciadora = typeof gerenciadoras.$inferSelect;

export const telemetryEvents = pgTable("telemetry_events", {
  id: serial("id").primaryKey(),
  vehicleId: integer("vehicle_id"),
  plate: text("plate").notNull(),
  eventType: text("event_type").notNull(),
  value: real("value"),
  duration: integer("duration"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  address: text("address"),
  driverName: text("driver_name"),
  details: text("details"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTelemetryEventSchema = createInsertSchema(telemetryEvents).omit({ id: true, createdAt: true });
export type InsertTelemetryEvent = z.infer<typeof insertTelemetryEventSchema>;
export type TelemetryEvent = typeof telemetryEvents.$inferSelect;

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

export const agentLocations = pgTable("agent_locations", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  employeeId: integer("employee_id"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  accuracy: real("accuracy"),
  speed: real("speed"),
  heading: real("heading"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertAgentLocationSchema = createInsertSchema(agentLocations).omit({ id: true, updatedAt: true });
export type InsertAgentLocation = z.infer<typeof insertAgentLocationSchema>;
export type AgentLocation = typeof agentLocations.$inferSelect;

export const agentLocationHistory = pgTable("agent_location_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  employeeId: integer("employee_id"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  accuracy: real("accuracy"),
  speed: real("speed"),
  heading: real("heading"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAgentLocationHistorySchema = createInsertSchema(agentLocationHistory).omit({ id: true, createdAt: true });
export type InsertAgentLocationHistory = z.infer<typeof insertAgentLocationHistorySchema>;
export type AgentLocationHistory = typeof agentLocationHistory.$inferSelect;

export const employeeAbsences = pgTable("employee_absences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  type: text("type").notNull(),
  startDate: timestamp("start_date").notNull(),
  endDate: timestamp("end_date"),
  reason: text("reason"),
  documentUrl: text("document_url"),
  status: text("status").notNull().default("pendente"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeAbsenceSchema = createInsertSchema(employeeAbsences).omit({ id: true, createdAt: true }).extend({
  startDate: z.preprocess((val) => (val === null || val === undefined || val === "" ? null : val), z.union([z.coerce.date(), z.null()])),
  endDate: z.preprocess((val) => (val === null || val === undefined || val === "" ? null : val), z.union([z.coerce.date(), z.null()])).optional(),
});
export type InsertEmployeeAbsence = z.infer<typeof insertEmployeeAbsenceSchema>;
export type EmployeeAbsence = typeof employeeAbsences.$inferSelect;

export const employeeFines = pgTable("employee_fines", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  vehicleId: integer("vehicle_id"),
  date: timestamp("date").notNull(),
  infraction: text("infraction").notNull(),
  amount: real("amount"),
  points: integer("points"),
  status: text("status").notNull().default("pendente"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeFineSchema = createInsertSchema(employeeFines).omit({ id: true, createdAt: true }).extend({
  date: z.preprocess((val) => (val === null || val === undefined || val === "" ? null : val), z.union([z.coerce.date(), z.null()])),
});
export type InsertEmployeeFine = z.infer<typeof insertEmployeeFineSchema>;
export type EmployeeFine = typeof employeeFines.$inferSelect;

export const employeeDisciplinary = pgTable("employee_disciplinary", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  type: text("type").notNull(),
  date: timestamp("date").notNull(),
  reason: text("reason").notNull(),
  description: text("description"),
  status: text("status").notNull().default("ativa"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeDisciplinarySchema = createInsertSchema(employeeDisciplinary).omit({ id: true, createdAt: true }).extend({
  date: z.preprocess((val) => (val === null || val === undefined || val === "" ? null : val), z.union([z.coerce.date(), z.null()])),
});
export type InsertEmployeeDisciplinary = z.infer<typeof insertEmployeeDisciplinarySchema>;
export type EmployeeDisciplinary = typeof employeeDisciplinary.$inferSelect;

export const employeeTimesheets = pgTable("employee_timesheets", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  date: timestamp("date").notNull(),
  clockIn: text("clock_in"),
  clockOut: text("clock_out"),
  lunchOut: text("lunch_out"),
  lunchIn: text("lunch_in"),
  overtime: real("overtime"),
  clockInPhoto: text("clock_in_photo"),
  clockOutPhoto: text("clock_out_photo"),
  lunchOutPhoto: text("lunch_out_photo"),
  lunchInPhoto: text("lunch_in_photo"),
  clockInLat: text("clock_in_lat"),
  clockInLng: text("clock_in_lng"),
  clockOutLat: text("clock_out_lat"),
  clockOutLng: text("clock_out_lng"),
  lunchOutLat: text("lunch_out_lat"),
  lunchOutLng: text("lunch_out_lng"),
  lunchInLat: text("lunch_in_lat"),
  lunchInLng: text("lunch_in_lng"),
  clockInAddress: text("clock_in_address"),
  clockOutAddress: text("clock_out_address"),
  lunchOutAddress: text("lunch_out_address"),
  lunchInAddress: text("lunch_in_address"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeTimesheetSchema = createInsertSchema(employeeTimesheets).omit({ id: true, createdAt: true }).extend({
  date: z.preprocess((val) => (val === null || val === undefined || val === "" ? null : val), z.union([z.coerce.date(), z.null()])),
});
export type InsertEmployeeTimesheet = z.infer<typeof insertEmployeeTimesheetSchema>;
export type EmployeeTimesheet = typeof employeeTimesheets.$inferSelect;

export const employeePayslips = pgTable("employee_payslips", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  grossSalary: real("gross_salary"),
  netSalary: real("net_salary"),
  deductions: real("deductions"),
  benefits: real("benefits"),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeePayslipSchema = createInsertSchema(employeePayslips).omit({ id: true, createdAt: true });
export type InsertEmployeePayslip = z.infer<typeof insertEmployeePayslipSchema>;
export type EmployeePayslip = typeof employeePayslips.$inferSelect;

export const employeeSalaryDiscounts = pgTable("employee_salary_discounts", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  month: integer("month").notNull(),
  year: integer("year").notNull(),
  type: text("type").notNull(),
  description: text("description").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdBy: text("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeSalaryDiscountSchema = createInsertSchema(employeeSalaryDiscounts).omit({ id: true, createdAt: true });
export type InsertEmployeeSalaryDiscount = z.infer<typeof insertEmployeeSalaryDiscountSchema>;
export type EmployeeSalaryDiscount = typeof employeeSalaryDiscounts.$inferSelect;

export const loginSelfies = pgTable("login_selfies", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  employeeId: integer("employee_id"),
  userName: text("user_name"),
  photoData: text("photo_data").notNull(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertLoginSelfieSchema = createInsertSchema(loginSelfies).omit({ id: true, createdAt: true });
export type InsertLoginSelfie = z.infer<typeof insertLoginSelfieSchema>;
export type LoginSelfie = typeof loginSelfies.$inferSelect;

export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  userName: text("user_name"),
  userRole: text("user_role"),
  action: text("action").notNull(),
  page: text("page"),
  details: text("details"),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  latitude: real("latitude"),
  longitude: real("longitude"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;

export const companyDocuments = pgTable("company_documents", {
  id: serial("id").primaryKey(),
  docType: text("doc_type").notNull(),
  label: text("label").notNull(),
  fileName: text("file_name").notNull(),
  fileData: text("file_data").notNull(),
  mimeType: text("mime_type").notNull(),
  uploadedAt: timestamp("uploaded_at").defaultNow(),
});

export const insertCompanyDocumentSchema = createInsertSchema(companyDocuments).omit({ id: true, uploadedAt: true });
export type InsertCompanyDocument = z.infer<typeof insertCompanyDocumentSchema>;
export type CompanyDocument = typeof companyDocuments.$inferSelect;

export const homologationLogs = pgTable("homologation_logs", {
  id: serial("id").primaryKey(),
  clientId: integer("client_id").notNull(),
  clientName: text("client_name"),
  recipientEmail: text("recipient_email").notNull(),
  recipientName: text("recipient_name"),
  documentsSent: text("documents_sent").array(),
  sentBy: text("sent_by"),
  status: text("status").notNull().default("enviado"),
  sentAt: timestamp("sent_at").defaultNow(),
});

export const insertHomologationLogSchema = createInsertSchema(homologationLogs).omit({ id: true, sentAt: true });
export type InsertHomologationLog = z.infer<typeof insertHomologationLogSchema>;
export type HomologationLog = typeof homologationLogs.$inferSelect;

export const missionUpdates = pgTable("mission_updates", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id").notNull(),
  osNumber: text("os_number"),
  employeeId: integer("employee_id"),
  employeeName: text("employee_name"),
  message: text("message").notNull(),
  missionStep: text("mission_step"),
  latitude: text("latitude"),
  longitude: text("longitude"),
  photoUrl: text("photo_url"),
  readByAdmin: integer("read_by_admin").default(0),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMissionUpdateSchema = createInsertSchema(missionUpdates).omit({ id: true, createdAt: true });
export type InsertMissionUpdate = z.infer<typeof insertMissionUpdateSchema>;
export type MissionUpdate = typeof missionUpdates.$inferSelect;

export const employeeOccurrences = pgTable("employee_occurrences", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull(),
  vehicleId: integer("vehicle_id"),
  type: text("type").notNull(),
  description: text("description").notNull(),
  photos: text("photos").array(),
  latitude: text("latitude"),
  longitude: text("longitude"),
  status: text("status").notNull().default("aberta"),
  adminNotes: text("admin_notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertEmployeeOccurrenceSchema = createInsertSchema(employeeOccurrences).omit({ id: true, createdAt: true });
export type InsertEmployeeOccurrence = z.infer<typeof insertEmployeeOccurrenceSchema>;
export type EmployeeOccurrence = typeof employeeOccurrences.$inferSelect;

export const referencePoints = pgTable("reference_points", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  radiusMeters: integer("radius_meters").notNull().default(500),
  color: text("color").notNull().default("#6366f1"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertReferencePointSchema = createInsertSchema(referencePoints).omit({ id: true, createdAt: true });
export type InsertReferencePoint = z.infer<typeof insertReferencePointSchema>;
export type ReferencePoint = typeof referencePoints.$inferSelect;

export const missionPositions = pgTable("mission_positions", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id").notNull(),
  vehicleId: integer("vehicle_id"),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  speed: real("speed"),
  ignition: integer("ignition"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMissionPositionSchema = createInsertSchema(missionPositions).omit({ id: true, createdAt: true });
export type InsertMissionPosition = z.infer<typeof insertMissionPositionSchema>;
export type MissionPosition = typeof missionPositions.$inferSelect;

export const clientForwards = pgTable("client_forwards", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id").notNull(),
  missionUpdateId: integer("mission_update_id"),
  clientId: integer("client_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  subject: text("subject"),
  message: text("message"),
  photoIncluded: boolean("photo_included").default(false),
  sentBy: text("sent_by"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertClientForwardSchema = createInsertSchema(clientForwards).omit({ id: true, createdAt: true });
export type InsertClientForward = z.infer<typeof insertClientForwardSchema>;
export type ClientForward = typeof clientForwards.$inferSelect;

export const missionCosts = pgTable("mission_costs", {
  id: serial("id").primaryKey(),
  serviceOrderId: integer("service_order_id").notNull(),
  category: text("category").notNull(),
  description: text("description"),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  costType: text("cost_type").default("expense"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertMissionCostSchema = createInsertSchema(missionCosts).omit({ id: true, createdAt: true });
export type InsertMissionCost = z.infer<typeof insertMissionCostSchema>;
export type MissionCost = typeof missionCosts.$inferSelect;

export const systemSettings = pgTable("system_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertSystemSettingSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettings.$inferSelect;
