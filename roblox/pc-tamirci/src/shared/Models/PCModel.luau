-- PCModel: turns a device view (RepairRules.view) into a 3D model on the bench and keeps it in sync.
--
-- Every template node gets its own Model (attribute NodeId) placed either
--   * attached: relative to its visual parent (board parts ride on the motherboard, screws on
--     their owner), or
--   * laid out: relative to the device root (removed parts are packed onto the mat, removed
--     screws drop into the magnetic tray, removed side panels lean against the pegboard).
-- update(view) rebuilds what changed and moves the rest; with opts.animate the moves are queued as
-- smooth transitions that the client advances with step(dt). Layouts come from DesktopLayout and
-- LaptopLayout, which describe each node (parent, home pose, how to build it).
--
-- rootCf: the device frame on the bench (+Y up, the technician looks along -Z, +X is their right).

local PCParts = require(script.Parent.PCParts)
local DesktopLayout = require(script.Parent.DesktopLayout)
local LaptopLayout = require(script.Parent.LaptopLayout)

local PCModel = {}

local Handle = {}
Handle.__index = Handle

-- default spots on the bench, relative to the device root
local TRAY = CFrame.new(-3.2, 0.14, 1.2)
local OUT_REGION = { x0 = 1.45, x1 = 4.3, z0 = -2.05, z1 = 2.1 }
local LEAN = CFrame.new(-0.4, 0, -2.1)

local function hashOf(s: string): number
	local h = 7
	for i = 1, #s do
		h = (h * 31 + string.byte(s, i)) % 1000003
	end
	return h
end

-- local AABB of a model relative to `frame`
local function extents(model: Model, frame: CFrame): (Vector3, Vector3)
	local lo = Vector3.new(math.huge, math.huge, math.huge)
	local hi = Vector3.new(-math.huge, -math.huge, -math.huge)
	for _, d in model:GetDescendants() do
		if d:IsA("BasePart") and d.Name ~= "Root" and d.Transparency < 1 then
			local h = d.Size / 2
			local c = d.CFrame
			for _, sx in { -1, 1 } do
				for _, sy in { -1, 1 } do
					for _, sz in { -1, 1 } do
						local p = frame:PointToObjectSpace(c * Vector3.new(h.X * sx, h.Y * sy, h.Z * sz))
						lo = lo:Min(p)
						hi = hi:Max(p)
					end
				end
			end
		end
	end
	if lo.X == math.huge then
		return Vector3.zero, Vector3.zero
	end
	return lo, hi
end

local function rotatedBox(lo: Vector3, hi: Vector3, rot: CFrame): (Vector3, Vector3)
	local rlo = Vector3.new(math.huge, math.huge, math.huge)
	local rhi = Vector3.new(-math.huge, -math.huge, -math.huge)
	for _, x in { lo.X, hi.X } do
		for _, y in { lo.Y, hi.Y } do
			for _, z in { lo.Z, hi.Z } do
				local p = rot * Vector3.new(x, y, z)
				rlo = rlo:Min(p)
				rhi = rhi:Max(p)
			end
		end
	end
	return rlo, rhi
end

function PCModel.build(parent: Instance?, view, rootCf: CFrame, opts: { [string]: any }?): any
	local self = setmetatable({}, Handle)
	self.opts = opts or {}
	self.root = rootCf
	self.kind = view.kind
	self.layout = if view.kind == "laptop" then LaptopLayout else DesktopLayout
	self.tray = self.opts.tray or TRAY
	self.recs = {}
	self.cables = {}
	self.anims = {}
	local model = Instance.new("Model")
	model.Name = "Device"
	model:SetAttribute("DeviceKind", view.kind)
	self.model = model
	self.nodesFolder = Instance.new("Folder")
	self.nodesFolder.Name = "Nodes"
	self.nodesFolder.Parent = model
	self.cableFolder = Instance.new("Folder")
	self.cableFolder.Name = "Cables"
	self.cableFolder.Parent = model
	self:update(view)
	model.Parent = parent
	return self
end

-- World frame of a node's visual parent.
function Handle:parentWorld(rec): CFrame
	if rec.parent then
		local p = self.recs[rec.parent]
		if p and p.world then
			return p.world
		end
	end
	return self.root * self.base
end

function Handle:worldOf(id: string): CFrame?
	local rec = self.recs[id]
	return rec and rec.world
end

-- Walks up from a hit part to the node it belongs to.
function Handle:nodeOf(part: Instance?): string?
	local p = part
	while p and p ~= self.model do
		local id = p:GetAttribute("NodeId")
		if id then
			return id
		end
		p = p.Parent
	end
	return nil
end

function Handle:destroy()
	self.model:Destroy()
	self.recs = {}
	self.anims = {}
end

-- Places a node (and, recursively, everything attached to it) from its current pose.
function Handle:poseNode(id: string)
	local rec = self.recs[id]
	if not rec then
		return
	end
	if rec.attached then
		rec.world = self:parentWorld(rec) * rec.cur
	else
		rec.world = self.root * rec.cur
	end
	if rec.model then
		rec.model:PivotTo(rec.world)
	end
	for _, child in rec.children do
		self:poseNode(child)
	end
end

function Handle:poseAll()
	for _, id in self.order do
		local rec = self.recs[id]
		if rec and (not rec.parent or not self.recs[rec.parent]) then
			self:poseNode(id)
		end
	end
end

----------------------------------------------------------------------------------------------------
-- update
----------------------------------------------------------------------------------------------------
function Handle:update(view)
	self.view = view
	local spec = self.layout.describe(view, self.opts)
	self.base = spec.base or CFrame.new()
	self.order = spec.order
	local animate = self.opts.animate and self.built
	local seen = {}

	-- 1. (re)build node models and work out where each one wants to be
	local targets = {}
	for _, id in spec.order do
		local s = spec.nodes[id]
		seen[id] = true
		local rec = self.recs[id]
		if not rec then
			rec = { id = id, children = {}, attached = true, cur = CFrame.new() }
			self.recs[id] = rec
		end
		rec.parent = s.parent
		rec.kind = s.kind
		rec.spec = s
		if s.hide then
			if rec.model then
				rec.model:Destroy()
				rec.model = nil
			end
			rec.sig = nil
			rec.hidden = true
		else
			local fresh = false
			if rec.sig ~= s.sig or not rec.model then
				if rec.model then
					rec.model:Destroy()
				end
				local m = s.build(CFrame.new())
				m.Name = "N_" .. id
				m:SetAttribute("NodeId", id)
				m.Parent = self.nodesFolder
				rec.model = m
				rec.sig = s.sig
				rec.lo, rec.hi = extents(m, CFrame.new())
				fresh = true
			end
			rec.fresh = fresh or rec.hidden
			rec.hidden = false
			if s.out then
				targets[id] = { attached = false }
			else
				targets[id] = { attached = true, cf = s.home * (s.offset or CFrame.new()) }
			end
		end
	end
	for id, rec in self.recs do
		if not seen[id] then
			if rec.model then
				rec.model:Destroy()
			end
			self.recs[id] = nil
		end
	end
	-- children lists
	for _, rec in self.recs do
		rec.children = {}
	end
	for _, id in spec.order do
		local rec = self.recs[id]
		if rec and rec.parent and self.recs[rec.parent] then
			table.insert(self.recs[rec.parent].children, id)
		end
	end

	-- 2. lay out everything that is off the device
	self:packOut(spec, targets)

	-- 3. move: immediately, or as queued transitions
	for _, id in spec.order do
		local rec = self.recs[id]
		local t = targets[id]
		if rec and t and not rec.hidden then
			local changed = rec.attached ~= t.attached or not rec.cur:FuzzyEq(t.cf, 1e-4)
			if changed then
				if animate and not rec.fresh and self.opts.animate then
					self:queue(rec, t)
				else
					self.anims[id] = nil
					rec.attached = t.attached
					rec.cur = t.cf
				end
			end
		end
	end
	self:poseAll()
	self.built = true

	-- 4. the cables and per-state looks
	self:rebuildCables(spec)
	if self.layout.decorate then
		self.layout.decorate(self, view)
	end
end

-- Packs removed parts onto the mat, screws into the tray, covers against the pegboard.
function Handle:packOut(spec, targets)
	local items = {}
	local screwIndex = 0
	for _, id in spec.order do
		local s = spec.nodes[id]
		local rec = self.recs[id]
		local t = targets[id]
		if t and not t.attached and rec and rec.model then
			if s.kind == "screw" then
				screwIndex += 1
				local h = hashOf(id)
				local a = (h % 360) * math.pi / 180
				local r = 0.04 + (h % 9) * 0.035
				t.cf = self.tray * CFrame.new(math.cos(a) * r, 0.01 + (screwIndex % 4) * 0.018, math.sin(a) * r) * CFrame.Angles(0, a, math.rad((h % 3) * 30 + 70))
			elseif s.lean then
				-- stand it up against the pegboard, leaning back slightly
				t.cf = LEAN * CFrame.Angles(math.rad(-96), 0, 0) * CFrame.new(0, 0, -rec.lo.Z)
			else
				local rot = s.outRot or CFrame.new()
				local lo, hi = rotatedBox(rec.lo, rec.hi, rot)
				local size = hi - lo
				-- prefer the long side along Z (the region is deep, not wide)
				if size.X > size.Z and size.X > OUT_REGION.x1 - OUT_REGION.x0 - 0.1 then
					rot = CFrame.Angles(0, math.pi / 2, 0) * rot
					lo, hi = rotatedBox(rec.lo, rec.hi, rot)
					size = hi - lo
				end
				table.insert(items, { id = id, t = t, rot = rot, lo = lo, hi = hi, size = size, area = size.X * size.Z, order = #items })
			end
		end
	end
	table.sort(items, function(a, b)
		if math.abs(a.area - b.area) > 1e-3 then
			return a.area > b.area
		end
		return a.order < b.order
	end)
	-- column packing; overflow stacks a second layer on top
	local R = OUT_REGION
	local x, z, colW, layerY, layerH = R.x0, R.z0, 0, 0.01, 0
	for _, it in items do
		local w, d = it.size.X, it.size.Z
		if z + d > R.z1 and z > R.z0 then
			x += colW + 0.12
			z = R.z0
			colW = 0
		end
		if x + w > R.x1 + 0.3 and x > R.x0 then
			x, z, colW = R.x0, R.z0, 0
			layerY += layerH + 0.02
			layerH = 0
		end
		local cx = x + w / 2 - (it.lo.X + it.hi.X) / 2
		local cz = z + d / 2 - (it.lo.Z + it.hi.Z) / 2
		it.t.cf = CFrame.new(cx, layerY - it.lo.Y, cz) * it.rot
		z += d + 0.1
		colW = math.max(colW, w)
		layerH = math.max(layerH, it.size.Y)
	end
end

----------------------------------------------------------------------------------------------------
-- Cables: rebuilt from the current poses after every update
----------------------------------------------------------------------------------------------------
function Handle:rebuildCables(spec)
	for _, m in self.cables do
		m:Destroy()
	end
	self.cables = {}
	if not spec.cables then
		return
	end
	for _, c in spec.cables do
		local ok, points, headCf = pcall(c.route, self)
		if ok and points then
			local m = PCParts.cable(points, c.style, headCf)
			m.Name = "N_" .. c.id
			m:SetAttribute("NodeId", c.id)
			m.Parent = self.cableFolder
			self.cables[c.id] = m
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Animation (client only)
----------------------------------------------------------------------------------------------------
local DUR = { screw = 0.9, latch = 0.25, panel = 0.75, comp = 0.8, root = 0.9, lid = 0.7, feet = 0.3 }

-- frame of a node relative to the root right now
function Handle:rootRelative(rec): CFrame
	return self.root:ToObjectSpace(rec.world or self.root)
end

function Handle:queue(rec, t)
	local from = self:rootRelative(rec)
	local kind = rec.kind
	local anim = {
		rec = rec,
		t = 0,
		dur = DUR[kind] or 0.6,
		from = from,
		target = t,
	}
	if (kind == "latch" or kind == "root" or kind == "lid" or kind == "feet" or kind == "pins") and t.attached and rec.attached then
		-- rotations about the parent: interpolate in the parent frame
		anim.local0 = rec.cur
		anim.lift = if kind == "root" then 0.9 else 0
	else
		anim.lift = if kind == "screw" then 0.35 elseif kind == "panel" then 0.5 else 0.6
	end
	-- for the duration the node floats relative to the root
	self.anims[rec.id] = anim
end

-- Advances every running transition; returns true while anything is moving.
function Handle:step(dt: number): boolean
	local any = false
	for id, a in self.anims do
		local rec = a.rec
		a.t = math.min(1, a.t + dt / a.dur)
		local e = a.t * a.t * (3 - 2 * a.t) -- smoothstep
		if a.local0 then
			local target = a.target.cf
			rec.attached = true
			rec.cur = a.local0:Lerp(target, e)
			if a.lift > 0 then
				rec.cur = CFrame.new(0, a.lift * 4 * e * (1 - e), 0) * rec.cur
			end
		else
			local toRel
			if a.target.attached then
				local pw = self:parentWorld(rec)
				toRel = self.root:ToObjectSpace(pw * a.target.cf)
			else
				toRel = a.target.cf
			end
			local p = a.from:Lerp(toRel, e)
			local lift = a.lift * 4 * e * (1 - e)
			local spin = CFrame.new()
			if rec.kind == "screw" then
				spin = CFrame.Angles(0, (if a.target.attached then -1 else 1) * e * math.pi * 6, 0)
			end
			rec.attached = false
			rec.cur = CFrame.new(0, lift, 0) * p * spin
		end
		if a.t >= 1 then
			rec.attached = a.target.attached
			rec.cur = a.target.cf
			self.anims[id] = nil
		else
			any = true
		end
		self:poseNode(id)
	end
	return any
end

function Handle:busy(): boolean
	return next(self.anims) ~= nil
end

PCModel.Handle = Handle
PCModel.hash = hashOf
return PCModel
