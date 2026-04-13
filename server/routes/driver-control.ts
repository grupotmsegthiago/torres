import type { Express, Request, Response } from "express";
import { requireAuth, requireAdminRole } from "../auth";
import { supabaseAdmin } from "../supabase";
import { logSystemAudit } from "../audit";

export function registerDriverControlRoutes(app: Express) {

  app.get("/api/driver-sessions", requireAuth, async (req: Request, res: Response) => {
    try {
      const status = req.query.status as string;
      const vehicleId = req.query.vehicleId as string;
      const driverId = req.query.driverId as string;
      const dateFrom = req.query.dateFrom as string;
      const dateTo = req.query.dateTo as string;

      let query = supabaseAdmin.from("driver_sessions").select("*").order("created_at", { ascending: false });

      if (status && status !== "ALL") query = query.eq("status", status);
      if (vehicleId) query = query.eq("vehicle_id", parseInt(vehicleId));
      if (driverId) query = query.or(`driver_id.eq.${parseInt(driverId)},partner_id.eq.${parseInt(driverId)}`);
      if (dateFrom) query = query.gte("started_at", `${dateFrom}T00:00:00`);
      if (dateTo) query = query.lte("started_at", `${dateTo}T23:59:59`);

      const { data, error } = await query.limit(200);
      if (error) throw error;
      res.json(data || []);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/driver-sessions/active", requireAuth, async (req: Request, res: Response) => {
    try {
      const userId = (req as any).user?.id;
      const employeeId = (req as any).user?.employeeId;

      let query = supabaseAdmin.from("driver_sessions").select("*").eq("status", "ativo");

      if (employeeId) {
        query = query.or(`driver_id.eq.${employeeId},partner_id.eq.${employeeId}`);
      }

      const { data, error } = await query.limit(1).maybeSingle();
      if (error) throw error;

      let shifts: any[] = [];
      if (data) {
        const { data: sh } = await supabaseAdmin.from("driver_shifts").select("*").eq("session_id", data.id).order("started_at", { ascending: true });
        shifts = sh || [];
      }

      res.json(data ? { ...data, shifts } : null);
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/driver-sessions/:id", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data, error } = await supabaseAdmin.from("driver_sessions").select("*").eq("id", id).single();
      if (error) throw error;
      if (!data) return res.status(404).json({ message: "Sessão não encontrada" });

      const { data: shifts } = await supabaseAdmin.from("driver_shifts").select("*").eq("session_id", id).order("started_at", { ascending: true });

      res.json({ ...data, shifts: shifts || [] });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/driver-sessions/start", requireAuth, async (req: Request, res: Response) => {
    try {
      const { vehicleId, driverId, partnerId, kmStart, notes } = req.body;

      if (!vehicleId || !driverId) {
        return res.status(400).json({ message: "Veículo e condutor são obrigatórios." });
      }

      const { data: existing } = await supabaseAdmin.from("driver_sessions")
        .select("id").eq("vehicle_id", vehicleId).eq("status", "ativo").maybeSingle();
      if (existing) {
        return res.status(400).json({ message: "Já existe uma sessão ativa para este veículo." });
      }

      const { data: vehicle } = await supabaseAdmin.from("vehicles").select("plate, frota, year").eq("id", vehicleId).single();
      const { data: driver } = await supabaseAdmin.from("employees").select("name").eq("id", driverId).single();
      let partnerName: string | null = null;
      if (partnerId) {
        const { data: partner } = await supabaseAdmin.from("employees").select("name").eq("id", partnerId).single();
        partnerName = partner?.name || null;
      }

      const { data: session, error } = await supabaseAdmin.from("driver_sessions").insert({
        vehicle_id: vehicleId,
        vehicle_plate: vehicle?.plate || "",
        vehicle_prefix: vehicle?.frota || "",
        vehicle_year: vehicle?.year || null,
        driver_id: driverId,
        partner_id: partnerId || null,
        driver_name: driver?.name || "Condutor",
        partner_name: partnerName,
        km_start: kmStart ? parseInt(kmStart) : null,
        status: "ativo",
        started_at: new Date().toISOString(),
        started_by_user_id: (req as any).user?.id || null,
        notes: notes || null,
      }).select().single();

      if (error) throw error;

      const { error: shiftErr } = await supabaseAdmin.from("driver_shifts").insert({
        session_id: session.id,
        driver_id: driverId,
        driver_name: driver?.name || "Condutor",
        started_at: new Date().toISOString(),
        is_active: true,
      });
      if (shiftErr) console.error("[driver-control] shift insert error:", shiftErr.message);

      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "DRIVER_SESSION_START", targetId: String(session.id), targetType: "driver_session",
        details: `Sessão iniciada: ${driver?.name} - VTR ${vehicle?.plate} (${vehicle?.frota}) KM=${kmStart || "N/A"}`,
        ipAddress: (req as any).ip,
      });

      console.log(`[driver-control] Sessão #${session.id} iniciada: ${driver?.name} VTR=${vehicle?.plate}`);
      res.status(201).json(session);
    } catch (err: any) {
      console.error("[driver-control] start error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/driver-sessions/:id/swap", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: session, error: sessErr } = await supabaseAdmin.from("driver_sessions")
        .select("*").eq("id", id).eq("status", "ativo").single();
      if (sessErr || !session) return res.status(404).json({ message: "Sessão ativa não encontrada." });

      const { data: activeShift } = await supabaseAdmin.from("driver_shifts")
        .select("*").eq("session_id", id).eq("is_active", true).single();
      if (!activeShift) return res.status(400).json({ message: "Nenhum turno ativo encontrado." });

      const now = new Date();
      const startedAt = new Date(activeShift.started_at);
      const durationMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60000 * 100) / 100;

      const { error: closeErr } = await supabaseAdmin.from("driver_shifts").update({
        ended_at: now.toISOString(),
        duration_minutes: durationMinutes,
        is_active: false,
      }).eq("id", activeShift.id);
      if (closeErr) throw closeErr;

      const currentDriverId = activeShift.driver_id;
      const nextDriverId = currentDriverId === session.driver_id ? session.partner_id : session.driver_id;
      const nextDriverName = currentDriverId === session.driver_id ? session.partner_name : session.driver_name;

      if (!nextDriverId) return res.status(400).json({ message: "Nenhum condutor parceiro definido para troca." });

      const { data: newShift, error: newErr } = await supabaseAdmin.from("driver_shifts").insert({
        session_id: id,
        driver_id: nextDriverId,
        driver_name: nextDriverName || "Parceiro",
        started_at: now.toISOString(),
        is_active: true,
      }).select().single();
      if (newErr) throw newErr;

      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "DRIVER_SWAP", targetId: String(id), targetType: "driver_session",
        details: `Troca: ${activeShift.driver_name} (${durationMinutes.toFixed(0)}min) → ${nextDriverName}. VTR ${session.vehicle_plate}`,
        ipAddress: (req as any).ip,
      });

      console.log(`[driver-control] Troca sessão #${id}: ${activeShift.driver_name} → ${nextDriverName}`);
      res.json({ message: "Troca realizada", previousShift: { ...activeShift, ended_at: now.toISOString(), duration_minutes: durationMinutes }, newShift });
    } catch (err: any) {
      console.error("[driver-control] swap error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.post("/api/driver-sessions/:id/end", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { kmEnd } = req.body;

      const { data: session, error: sessErr } = await supabaseAdmin.from("driver_sessions")
        .select("*").eq("id", id).eq("status", "ativo").single();
      if (sessErr || !session) return res.status(404).json({ message: "Sessão ativa não encontrada." });

      const now = new Date();

      const { data: activeShift } = await supabaseAdmin.from("driver_shifts")
        .select("*").eq("session_id", id).eq("is_active", true).maybeSingle();
      if (activeShift) {
        const startedAt = new Date(activeShift.started_at);
        const durationMinutes = Math.round((now.getTime() - startedAt.getTime()) / 60000 * 100) / 100;
        await supabaseAdmin.from("driver_shifts").update({
          ended_at: now.toISOString(),
          duration_minutes: durationMinutes,
          is_active: false,
        }).eq("id", activeShift.id);
      }

      const { data: updated, error: updErr } = await supabaseAdmin.from("driver_sessions").update({
        status: "finalizado",
        ended_at: now.toISOString(),
        km_end: kmEnd ? parseInt(kmEnd) : null,
      }).eq("id", id).select().single();
      if (updErr) throw updErr;

      if (kmEnd && session.vehicle_id) {
        await supabaseAdmin.from("vehicles").update({
          km: parseInt(kmEnd),
          last_km_update: now.toISOString(),
        }).eq("id", session.vehicle_id);
      }

      const { data: allShifts } = await supabaseAdmin.from("driver_shifts").select("*").eq("session_id", id).order("started_at", { ascending: true });

      await logSystemAudit({
        userId: (req as any).user?.id, userName: (req as any).user?.name, userRole: (req as any).user?.role,
        action: "DRIVER_SESSION_END", targetId: String(id), targetType: "driver_session",
        details: `Sessão #${id} finalizada. VTR ${session.vehicle_plate} KM=${kmEnd || "N/A"}. ${(allShifts || []).length} turno(s).`,
        ipAddress: (req as any).ip,
      });

      console.log(`[driver-control] Sessão #${id} finalizada. KM final=${kmEnd || "N/A"}`);
      res.json({ ...updated, shifts: allShifts || [] });
    } catch (err: any) {
      console.error("[driver-control] end error:", err.message);
      res.status(500).json({ message: err.message });
    }
  });

  app.get("/api/driver-sessions/:id/report", requireAuth, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      const { data: session } = await supabaseAdmin.from("driver_sessions").select("*").eq("id", id).single();
      if (!session) return res.status(404).json({ message: "Sessão não encontrada" });

      const { data: shifts } = await supabaseAdmin.from("driver_shifts").select("*").eq("session_id", id).order("started_at", { ascending: true });

      const driverTotals: Record<string, { name: string; totalMinutes: number; shifts: number }> = {};
      for (const s of (shifts || [])) {
        if (!driverTotals[s.driver_id]) {
          driverTotals[s.driver_id] = { name: s.driver_name, totalMinutes: 0, shifts: 0 };
        }
        driverTotals[s.driver_id].totalMinutes += Number(s.duration_minutes) || 0;
        driverTotals[s.driver_id].shifts += 1;
      }

      res.json({
        session,
        shifts: shifts || [],
        driverTotals: Object.values(driverTotals),
        totalSwaps: Math.max(0, (shifts || []).length - 1),
        kmTotal: session.km_end && session.km_start ? session.km_end - session.km_start : null,
      });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  app.delete("/api/driver-sessions/:id", requireAdminRole, async (req: Request, res: Response) => {
    try {
      const id = parseInt(req.params.id);
      await supabaseAdmin.from("driver_shifts").delete().eq("session_id", id);
      const { error } = await supabaseAdmin.from("driver_sessions").delete().eq("id", id);
      if (error) throw error;
      res.json({ message: "Sessão excluída" });
    } catch (err: any) {
      res.status(500).json({ message: err.message });
    }
  });

  console.log("[driver-control] Rotas de controle de condutor registradas");
}
