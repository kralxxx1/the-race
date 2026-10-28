-- DesktopLayout: where every node of a desktop sits and how to draw it, for PCModel.
--
-- The case lies on its side the way technicians work on it: the open side faces up (+Y), the front
-- panel is on the left (-X), the rear I/O on the right (+X), the top of the tower away from the
-- technician (-Z) and the PSU end towards them (+Z). Board parts are posed in the motherboard's
-- own frame (origin at its top-rear corner, PCB surface at y = 0).

local Shared = script.Parent.Parent
local Parts = require(Shared.Data.Parts)
local Rules = require(Shared.Repair.RepairRules)
local Templates = require(Shared.Repair.DeviceTemplates)
local PCParts = require(script.Parent.PCParts)

local DesktopLayout = {}

local cm = PCParts.cm
local T = Templates.desktop

local function partOf(view, id: string)
	local s = view.nodes[id]
	return s and s.part and Parts.get(s.part) or nil
end

local function screwBit(view, id: string): string
	local ok, bit = pcall(Rules.screwBit, view, id)
	return if ok then bit else "PH2"
end

local MOUNT_HOLES = {
	ATX = { { 5.5, 0.6 }, { 23.6, 0.8 }, { 23.6, 17.3 }, { 23.6, 29.7 }, { 1.2, 29.7 }, { 1.2, 17 } },
	mATX = { { 5.5, 0.6 }, { 23.6, 0.8 }, { 23.6, 17.3 }, { 23.6, 23.6 }, { 1.2, 23.6 }, { 1.2, 17 } },
	ITX = { { 5.5, 0.6 }, { 16.2, 0.8 }, { 16.2, 16.2 }, { 1.2, 16.2 }, { 12.6, 4.9 }, { 9, 16.4 } },
}

-- Everything the layout derives from the case and the installed board/PSU.
local function geometry(view)
	local casePart = Parts.get(view.model)
	local dims = PCParts.caseDims(casePart)
	local lx, ly, lz = dims.X, dims.Y, dims.Z
	local style = casePart and casePart.style or "airflow"
	local mobo = partOf(view, "mobo")
	local BL = PCParts.boardLayout(mobo)
	local g = { case = casePart, dims = dims, style = style, board = BL, moboPart = mobo }
	-- PSU: bottom-rear, or front-top in slim cases; turned flat if the case is too low
	local psuPart = partOf(view, "psu")
	local pd = PCParts.psuDims(psuPart)
	local rot = CFrame.new()
	local dx, dy, dz = pd.X, pd.Y, pd.Z
	if dy > ly - 0.08 then
		rot = CFrame.Angles(math.pi / 2, 0, 0)
		dy, dz = pd.Z, pd.Y
	end
	if style == "sff" then
		g.psu = CFrame.new(-lx / 2 + 0.06 + dx / 2, 0.04 + dy / 2, -lz / 2 + 0.05 + dz / 2) * rot
	else
		g.psu = CFrame.new(lx / 2 - 0.04 - dx / 2, 0.04 + dy / 2, lz / 2 - 0.1 - dz / 2) * rot
	end
	g.psuSize = Vector3.new(dx, dy, dz)
	-- board: top-rear corner below the top fans (closer to the top in short cases)
	local topGap = if style == "office" then 0.12 elseif style == "retro" then 0.15 elseif style == "sff" then 0.12 else 0.34
	g.mobo = CFrame.new(lx / 2 - 0.2, 0.1, -lz / 2 + topGap)
	-- the front strip between the front panel and the board
	g.frontX0 = -lx / 2 + cm(2.4) + 0.2
	g.frontX1 = lx / 2 - 0.2 - cm(BL.W)
	return g
end
DesktopLayout.geometry = geometry

-- Drive bays laid on the tray in the front strip; turned lengthwise if the strip is narrow.
local function bayPose(g, d: Vector3, atTop: boolean): CFrame
	local gap = g.frontX1 - g.frontX0
	local lz = g.dims.Z
	local rot = CFrame.new()
	local w, depth = d.X, d.Z
	if w > gap - 0.04 then
		rot = CFrame.Angles(0, math.pi / 2, 0)
		w, depth = d.Z, d.X
	end
	local x = g.frontX0 + w / 2 + 0.02
	local z = if atTop then -lz / 2 + 0.45 + depth / 2 else lz / 2 - 0.08 - depth / 2
	if g.style == "sff" and atTop then
		z = lz / 2 - 0.08 - depth / 2
	end
	return CFrame.new(x, 0.04, z) * rot
end

-- Case fan homes: axis +Y of the fan model turned to blow along the case.
local function fanHome(g, id: string, size: number): CFrame
	local lx, ly, lz = g.dims.X, g.dims.Y, g.dims.Z
	local t = cm(2.6)
	if id == "fan_r" then
		local y = math.max(ly / 2, 0.38 + size / 2)
		return CFrame.new(lx / 2 - 0.035 - t / 2, math.min(y, ly - size / 2 - 0.02), g.mobo.Z + cm(8)) * CFrame.Angles(0, 0, math.pi / 2)
	elseif string.sub(id, 1, 5) == "fan_f" then
		local i = tonumber(string.sub(id, 6)) or 1
		return CFrame.new(-lx / 2 + cm(2.4) + t / 2, ly / 2, (i - 2) * (size + 0.04)) * CFrame.Angles(0, 0, -math.pi / 2)
	else
		local i = tonumber(string.sub(id, 6)) or 1
		local x = if i == 1 then -0.62 else 0.38
		return CFrame.new(x, math.min(ly / 2 + 0.1, ly - size / 2 - 0.02), -lz / 2 + 0.035 + t / 2) * CFrame.Angles(math.pi / 2, 0, 0)
	end
end

local function fanSize(fanPart): number
	return cm(fanPart and fanPart.size or 120) / 10
end

function DesktopLayout.describe(view, _opts)
	local g = geometry(view)
	local BL = g.board
	local lx, ly, lz = g.dims.X, g.dims.Y, g.dims.Z
	local nodes = {}
	local order = {}
	local visible = view.visible or {}

	local function st(id: string): string?
		local s = view.nodes[id]
		return s and s.st
	end

	local function add(id: string, s)
		s.kind = s.kind or (T.nodes[id] and T.nodes[id].kind) or "comp"
		nodes[id] = s
		table.insert(order, id)
		return s
	end

	-- screws of an owner: homes are given relative to the owner
	local function screws(owner: string, homes: { CFrame })
		local tn = T.nodes[owner]
		for i, sid in tn.screws do
			local home = homes[i] or homes[#homes]
			if not Rules.available(view, sid) or nodes[owner] == nil or nodes[owner].hide then
				add(sid, { hide = true, kind = "screw" })
			else
				local bit = screwBit(view, sid)
				add(sid, {
					kind = "screw",
					parent = owner,
					home = home,
					out = st(sid) ~= "in",
					sig = "screw:" .. bit,
					build = function(cf)
						return PCParts.screw(cf, bit)
					end,
				})
			end
		end
	end

	-- a component slot: hidden when empty, laid out when removed
	local function comp(id: string, parent: string?, home: CFrame, builder: (CFrame, any) -> Model, extra: { [string]: any }?)
		local s = view.nodes[id]
		local part = partOf(view, id)
		if not s or s.st == "empty" or not part or not Rules.available(view, id) then
			return add(id, { hide = true })
		end
		local spec = {
			parent = parent,
			home = home,
			out = s.st == "out",
			sig = id .. ":" .. part.id,
			build = function(cf)
				return builder(cf, part)
			end,
		}
		if extra then
			for k, v in extra do
				spec[k] = v
			end
		end
		return add(id, spec)
	end

	-- the chassis
	add("case", {
		kind = "root",
		home = CFrame.new(),
		sig = "case:" .. tostring(view.model),
		build = function(cf)
			local m = PCParts.chassis(cf, g.case)
			return m
		end,
	})

	-- side panel and its thumb screws
	local panelSt = st("side_panel")
	add("side_panel", {
		kind = "panel",
		parent = "case",
		home = CFrame.new(0, ly + 0.0125, 0),
		offset = if panelSt == "loose" then CFrame.new(0, 0.06, 0) else nil,
		out = panelSt == "out",
		lean = true,
		sig = "panel:" .. tostring(view.model),
		build = function(cf)
			return PCParts.sidePanel(cf, g.case, g.dims)
		end,
	})
	local spHomes = {}
	for _, o in { { 1, -1 }, { 1, 1 }, { -1, -1 }, { -1, 1 } } do
		table.insert(spHomes, CFrame.new(o[1] * (lx / 2 - 0.14), 0.0125, o[2] * (lz / 2 - 0.14)))
	end
	screws("side_panel", spHomes)

	-- power supply
	comp("psu", "case", g.psu, function(cf, p)
		return PCParts.psu(cf, p)
	end)
	local pd = PCParts.psuDims(partOf(view, "psu"))
	screws("psu", {
		CFrame.new(pd.X / 2 - cm(0.8), pd.Y / 2, -pd.Z / 2 + cm(0.9)),
		CFrame.new(pd.X / 2 - cm(0.8), pd.Y / 2, pd.Z / 2 - cm(0.9)),
		CFrame.new(-pd.X / 2 + cm(0.8), pd.Y / 2, -pd.Z / 2 + cm(0.9)),
		CFrame.new(-pd.X / 2 + cm(0.8), pd.Y / 2, pd.Z / 2 - cm(0.9)),
	})

	-- motherboard and everything on it
	comp("mobo", "case", g.mobo, function(cf, p)
		local m = PCParts.mobo(cf, p)
		return m
	end)
	local holes = MOUNT_HOLES[BL.form] or MOUNT_HOLES.ATX
	local mbHomes = {}
	for _, h in holes do
		table.insert(mbHomes, BL.at(h[1], h[2]))
	end
	screws("mobo", mbHomes)

	local socket = g.moboPart and g.moboPart.socket or "AM4"
	if g.moboPart and st("mobo") ~= "empty" and Rules.available(view, "socket") then
		local bent = st("socket") == "bent" and st("cpu") ~= "in"
		add("socket", {
			kind = "pins",
			parent = "mobo",
			home = BL.socket,
			sig = "pins:" .. socket .. ":" .. tostring(bent),
			build = function(cf)
				return PCParts.pins(cf, socket, bent)
			end,
		})
	else
		add("socket", { hide = true })
	end

	local paste = view.paste or { st = "none" }
	comp("cpu", "mobo", BL.socket * CFrame.new(0, cm(0.55), 0), function(cf, p)
		local m = PCParts.cpu(cf, p)
		if paste.st ~= "clean" and paste.st ~= "none" then
			local blob = PCParts.paste(cf * CFrame.new(0, cm(0.42), 0))
			local part = blob:FindFirstChild("Blob") :: BasePart
			if part then
				local sw, sh = PCParts.socketSize(p.socket or "AM4")
				if paste.st == "fresh" then
					part.Size = Vector3.new(0.008, cm(sw * 0.45), cm(sw * 0.45))
					part.Color = Color3.fromRGB(150, 152, 160)
				elseif paste.st == "old" then
					part.Size = Vector3.new(0.006, cm(math.min(sw, sh) * 0.72), cm(math.min(sw, sh) * 0.72))
					part.Color = Color3.fromRGB(120, 122, 128)
				else
					part.Size = Vector3.new(0.006, cm(math.min(sw, sh) * 0.66), cm(math.min(sw, sh) * 0.66))
					part.Color = Color3.fromRGB(200, 200, 196)
					part.Material = Enum.Material.Slate
				end
			end
			blob.Parent = m
		end
		return m
	end, {
		sig = "cpu:" .. tostring(view.nodes.cpu and view.nodes.cpu.part) .. ":" .. tostring(paste.st),
	})

	if g.moboPart and Rules.available(view, "cpu_arm") and st("mobo") ~= "empty" then
		local sw, sh = PCParts.socketSize(socket)
		local open = st("cpu_arm") == "open"
		add("cpu_arm", {
			kind = "latch",
			parent = "mobo",
			home = BL.socket * CFrame.new(cm(sh / 2 + 0.9), cm(0.2), cm(sw / 2 + 0.5)),
			offset = if open then CFrame.Angles(math.rad(100), 0, 0) else nil,
			sig = "arm",
			build = function(cf)
				return PCParts.latch(cf, "arm")
			end,
		})
	else
		add("cpu_arm", { hide = true })
	end

	-- cooler: an AIO's radiator hangs behind the front fans
	local coolerHome = BL.socket * CFrame.new(0, cm(0.97), 0)
	local radInCase = CFrame.new(-lx / 2 + cm(2.4) + cm(2.6) + 0.12, ly / 2, 0) * CFrame.Angles(0, math.pi / 2, 0)
	comp("cooler", "mobo", coolerHome, function(cf, p)
		local ctx = { radCf = (g.mobo * coolerHome):ToObjectSpace(radInCase) }
		return PCParts.cooler(cf, p, ctx)
	end)
	local coolerPart = partOf(view, "cooler")
	local base = if coolerPart and coolerPart.kind == "air" then cm(1.2) elseif coolerPart and coolerPart.kind == "aio" then cm(0.4) else cm(1.2)
	screws("cooler", {
		CFrame.new(-cm(3.7), base, -cm(3.7)),
		CFrame.new(cm(3.7), base, -cm(3.7)),
		CFrame.new(-cm(3.7), base, cm(3.7)),
		CFrame.new(cm(3.7), base, cm(3.7)),
	})

	-- memory and clips
	for i = 1, 4 do
		local id = "ram" .. i
		local slot = BL.ram[i]
		if slot then
			local unseated = visible[id] == "unseated"
			comp(id, "mobo", slot * CFrame.new(0, cm(0.25), 0), function(cf, p)
				return PCParts.ram(cf, p)
			end, {
				offset = if unseated then CFrame.new(0, 0.03, 0) * CFrame.Angles(0, 0, math.rad(5)) else nil,
				outRot = CFrame.Angles(0, 0, -math.pi / 2),
			})
			local clipId = id .. "_clip"
			if Rules.available(view, clipId) and st("mobo") ~= "empty" then
				local open = st(clipId) == "open"
				add(clipId, {
					kind = "latch",
					parent = "mobo",
					home = slot * CFrame.new(0, 0, -cm(BL.ramLen / 2 + 0.7)),
					offset = if open then CFrame.Angles(math.rad(-45), 0, 0) else nil,
					sig = "clip",
					build = function(cf)
						return PCParts.latch(cf, "ram")
					end,
				})
			else
				add(clipId, { hide = true })
			end
		else
			add(id, { hide = true })
			add(id .. "_clip", { hide = true })
		end
	end

	-- graphics card (posed from the board's x16 slot, mounted to the case)
	local gpuPart = partOf(view, "gpu")
	local gpuHome = g.mobo * CFrame.new(-cm(2), cm(0.8), cm(15.3))
	local connectors = if gpuPart then Parts.gpuConnectors(gpuPart) else {}
	comp("gpu", "case", gpuHome, function(cf, p)
		local m = PCParts.gpu(cf, p, connectors)
		return m
	end, {
		offset = if visible.gpu == "unseated" then CFrame.new(0, 0.03, 0) * CFrame.Angles(math.rad(-3), 0, 0) else nil,
		outRot = CFrame.Angles(math.rad(-90), 0, 0),
	})
	local _, gh = PCParts.gpuDims(gpuPart)
	screws("gpu", {
		CFrame.new(cm(0.8), gh + cm(0.35), cm(0.1)),
		CFrame.new(cm(0.8), gh + cm(0.35), cm(2.1)),
	})
	if Rules.available(view, "pcie_latch") and st("mobo") ~= "empty" then
		local open = st("pcie_latch") == "open"
		add("pcie_latch", {
			kind = "latch",
			parent = "mobo",
			home = BL.pcieLatch,
			offset = if open then CFrame.Angles(0, 0, math.rad(-35)) else nil,
			sig = "pcie",
			build = function(cf)
				return PCParts.latch(cf, "pcie")
			end,
		})
	else
		add("pcie_latch", { hide = true })
	end

	-- M.2 drives
	for i = 1, 2 do
		local id = "nvme" .. i
		local slot = BL.nvme[i] or BL.nvme[1]
		local d = PCParts.storageDims(partOf(view, id))
		comp(id, "mobo", slot * CFrame.new(-cm(0.2), cm(0.4), 0), function(cf, p)
			return PCParts.storage(cf, p)
		end)
		screws(id, { CFrame.new(-d.X / 2 + cm(0.15), cm(0.35), 0) })
	end

	-- drive bays
	local hddPart = partOf(view, "hdd1")
	local hd = PCParts.storageDims(hddPart or Parts.get("st_hdd1t"))
	comp("hdd1", "case", bayPose(g, hd, false), function(cf, p)
		return PCParts.storage(cf, p)
	end)
	screws("hdd1", {
		CFrame.new(-hd.X / 2 + cm(1.6), hd.Y, -hd.Z / 2 + cm(1)),
		CFrame.new(-hd.X / 2 + cm(1.6), hd.Y, hd.Z / 2 - cm(1)),
	})
	local ssdPart = partOf(view, "ssd1")
	local sd = PCParts.storageDims(ssdPart or Parts.get("st_ssd480"))
	comp("ssd1", "case", bayPose(g, sd, true), function(cf, p)
		return PCParts.storage(cf, p)
	end)
	screws("ssd1", {
		CFrame.new(-sd.X / 2 + cm(1.2), sd.Y, -sd.Z / 2 + cm(0.9)),
		CFrame.new(-sd.X / 2 + cm(1.2), sd.Y, sd.Z / 2 - cm(0.9)),
	})

	-- CMOS battery and the service capacitors
	comp("cmos", "mobo", BL.cmos * CFrame.new(0, cm(0.05), 0), function(cf)
		return PCParts.cmos(cf)
	end)
	for i = 1, 6 do
		local id = "cap" .. i
		local bulged = visible[id] == "bulged"
		local s = view.nodes[id]
		comp(id, "mobo", BL.caps[i], function(cf)
			return PCParts.capacitor(cf, bulged)
		end, {
			sig = id .. ":" .. tostring(s and s.part) .. ":" .. tostring(bulged),
			offset = if s and s.st == "loose" then CFrame.new(0, 0.06, 0) * CFrame.Angles(0, 0, math.rad(8)) else nil,
		})
	end

	-- case fans (with their four screws)
	for _, id in T.fanSlots do
		local fp = partOf(view, id)
		local size = fanSize(fp)
		comp(id, "case", fanHome(g, id, size), function(cf, p)
			return PCParts.fan(cf, p)
		end)
		local c = size * 0.41
		screws(id, {
			CFrame.new(-c, cm(1.3), -c),
			CFrame.new(c, cm(1.3), -c),
			CFrame.new(-c, cm(1.3), c),
			CFrame.new(c, cm(1.3), c),
		})
	end

	-- cables (drawn by PCModel from the posed nodes)
	local cables = DesktopLayout.cables(view, g)

	-- every template node must be described
	for _, id in T.order do
		if not nodes[id] and T.nodes[id].kind ~= "cable" then
			add(id, { hide = true })
		end
	end
	return { base = CFrame.new(-0.5, 0, 0), order = order, nodes = nodes, cables = cables }
end

----------------------------------------------------------------------------------------------------
-- Cable routes
----------------------------------------------------------------------------------------------------
local ROUTE_Y = { atx24 = 0.24, eps = 0.3, pcie = 1.3, sata_power = 0.26, sata_data = 0.22, fan = 0.2 }

function DesktopLayout.cables(view, g)
	local BL = g.board
	local list = {}
	local function st(id: string): string?
		local s = view.nodes[id]
		return s and s.st
	end
	local function cable(id: string, style: string, src: (any) -> Vector3?, dst: (any) -> CFrame?, viaFront: boolean?)
		if not Rules.available(view, id) then
			return
		end
		local tn = T.nodes[id]
		local plugged = st(id) == "in"
		local a, b = st(tn.ends[1]), st(tn.ends[2])
		if not plugged and not (a == "in" and b == "in") then
			return
		end
		table.insert(list, {
			id = id,
			style = style,
			route = function(h)
				local w0 = src(h)
				local head = dst(h)
				if not w0 or not head then
					return nil
				end
				local headH = PCParts.CableStyle[style].head[2]
				if not plugged then
					-- pulled off: the plug hangs above its socket
					head = CFrame.new(0, 0.32, 0) * head * CFrame.new(0.06, 0, 0.08) * CFrame.Angles(math.rad(25), 0, math.rad(15))
				end
				-- route in the device frame, then back to the world
				local R = h.root
				local a = R:PointToObjectSpace(w0)
				local top = (R:ToObjectSpace(head) * CFrame.new(0, headH, 0)).Position
				local y = ROUTE_Y[style] or 0.3
				local pts = { a, Vector3.new(a.X, math.max(a.Y, y), a.Z) }
				if viaFront then
					local fx = R:PointToObjectSpace(((h:worldOf("mobo") or R) * BL.at(BL.W + 1.6, 0)).Position).X
					table.insert(pts, Vector3.new(fx, math.max(a.Y, y), a.Z))
					table.insert(pts, Vector3.new(fx, math.max(a.Y, y), top.Z))
				end
				-- square runs: along Z first, then across X
				local last = pts[#pts]
				table.insert(pts, Vector3.new(last.X, last.Y, top.Z))
				table.insert(pts, Vector3.new(top.X, math.max(top.Y, y), top.Z))
				table.insert(pts, top)
				for i, p in pts do
					pts[i] = R * p
				end
				return pts, head
			end,
		})
	end

	local function on(id: string, rel: CFrame): (any) -> CFrame?
		return function(h)
			local w = h:worldOf(id)
			return w and w * rel or nil
		end
	end
	local function psuOut(rel: Vector3): (any) -> Vector3?
		return function(h)
			local w = h:worldOf("psu")
			if not w then
				return nil
			end
			local d = g.psuSize
			return (w * CFrame.new(-d.X / 2 - 0.02 + rel.X, rel.Y, rel.Z)).Position
		end
	end

	cable("c24", "atx24", psuOut(Vector3.new(0, 0.1, -0.15)), on("mobo", BL.atx24 * CFrame.new(0, cm(1.1), 0)), true)
	cable("ceps", "eps", psuOut(Vector3.new(0, 0.25, 0)), on("mobo", BL.eps * CFrame.new(0, cm(1), 0)), true)
	local gpuPart = partOf(view, "gpu")
	local sockets = if gpuPart then PCParts.gpuSockets(gpuPart, Parts.gpuConnectors(gpuPart)) else {}
	for i = 1, 3 do
		if sockets[i] then
			cable("cpcie" .. i, "pcie", psuOut(Vector3.new(0, 0.3, 0.12 * i)), on("gpu", sockets[i]))
		end
	end
	local coolerPart = partOf(view, "cooler")
	local fanAt = if coolerPart and coolerPart.kind == "air" then CFrame.new(-cm(4), cm(9), cm(5)) elseif coolerPart and coolerPart.kind == "aio" then CFrame.new(cm(2.5), cm(2), cm(2.5)) else CFrame.new(cm(4), cm(3.6), cm(3))
	cable("cfan_cpu", "fan", function(h)
		local w = h:worldOf("cooler")
		return w and (w * fanAt).Position or nil
	end, on("mobo", BL.cpuFan * CFrame.new(0, cm(0.6), 0)))
	for k, id in Rules.FanOrder do
		local header = BL.sysFan[k] or BL.sysFan[1]
		cable("cfan_" .. id, "fan", function(h)
			local w = h:worldOf(id)
			return w and (w * CFrame.new(cm(5), -cm(1.3), cm(5))).Position or nil
		end, on("mobo", header * CFrame.new(0, cm(0.6), 0)))
	end
	-- SATA: power from the PSU, data to the board's ports; drive sockets are on the +X end
	local function driveSocket(id: string, z: number): (any) -> CFrame?
		return function(h)
			local w = h:worldOf(id)
			if not w then
				return nil
			end
			local d = PCParts.storageDims(partOf(view, id))
			-- plug pushed in along +X, its width across the drive (Z)
			return w * CFrame.new(d.X / 2 + 0.01, d.Y * 0.45, z * d.Z) * CFrame.fromMatrix(Vector3.zero, Vector3.new(0, 0, 1), Vector3.new(1, 0, 0))
		end
	end
	local function driveSrc(id: string, z: number): (any) -> Vector3?
		local f = driveSocket(id, z)
		return function(h)
			local c = f(h)
			return c and (c * CFrame.new(0, 0.06, 0)).Position or nil
		end
	end
	cable("csp_hdd1", "sata_power", psuOut(Vector3.new(0, 0.15, 0.25)), driveSocket("hdd1", -0.15))
	cable("csd_hdd1", "sata_data", driveSrc("hdd1", 0.25), on("mobo", BL.sata[1] * CFrame.new(0, cm(1), 0)))
	cable("csp_ssd1", "sata_power", psuOut(Vector3.new(0, 0.2, 0.3)), driveSocket("ssd1", -0.15))
	cable("csd_ssd1", "sata_data", driveSrc("ssd1", 0.2), on("mobo", BL.sata[2] * CFrame.new(0, cm(1), 0)))
	return list
end

----------------------------------------------------------------------------------------------------
-- Per-state looks that don't need a rebuild
----------------------------------------------------------------------------------------------------
function DesktopLayout.decorate(handle, view)
	for id, rec in handle.recs do
		if rec.model then
			local s = view.nodes[id]
			local dust = s and s.dust or 0
			for _, d in rec.model:GetDescendants() do
				if d:IsA("BasePart") and d:GetAttribute("Dust") then
					local opacity = math.clamp((dust - 0.03) * 3.2, 0, 0.9)
					d.Transparency = 1 - opacity
				end
			end
		end
	end
	-- zip-tied cable runs read as tidy (cable model gets a couple of white ties)
	if view.ties then
		for id, m in handle.cables do
			if id == "c24" or id == "ceps" then
				local head = m:FindFirstChild("Head") :: BasePart?
				if head then
					PCParts.box(m, head.CFrame * CFrame.new(0, 0, 0.3), Vector3.new(0.2, 0.09, 0.02), Color3.fromRGB(240, 240, 240), Enum.Material.SmoothPlastic, { Name = "Tie" })
				end
			end
		end
	end
end

return DesktopLayout
