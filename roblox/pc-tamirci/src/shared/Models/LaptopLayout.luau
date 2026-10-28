-- LaptopLayout: where every node of a laptop sits and how to draw it, for PCModel.
--
-- Base frame (node "base"): origin in the middle of the chassis, keyboard deck up (+Y), hinge at
-- -Z, palm rest edge at +Z. Internals are drawn to be seen from below, because the technician
-- flips the laptop (base rotates 180° about Z) to open the bottom cover. The lid is a synthetic
-- node "lid" hinged on the deck; the bezel, screen and hinges ride on it.

local Shared = script.Parent.Parent
local Parts = require(Shared.Data.Parts)
local Devices = require(Shared.Data.Devices)
local Rules = require(Shared.Repair.RepairRules)
local Templates = require(Shared.Repair.DeviceTemplates)
local PCParts = require(script.Parent.PCParts)

local LaptopLayout = {}

local cm = PCParts.cm
local box = PCParts.box
local cyl = PCParts.cyl
local newModel = PCParts.newModel
local M = Enum.Material
local T = Templates.laptop

local DOWN = CFrame.Angles(math.pi, 0, 0) -- faces -Y (seen from below)

local function partOf(view, id: string)
	local s = view.nodes[id]
	return s and s.part and Parts.get(s.part) or nil
end

local function screwBit(view, id: string): string
	local ok, bit = pcall(Rules.screwBit, view, id)
	return if ok then bit else "PH1"
end

-- Dimensions in studs: w, d, base thickness, lid thickness.
function LaptopLayout.dims(view)
	local model = Devices.laptop(view.model) or Devices.laptops[1]
	local d = Devices.laptopDims[model.class] or { 36, 24, 2 }
	local total = cm(d[3])
	local lidT = math.clamp(total * 0.3, cm(0.5), cm(0.8))
	return { w = cm(d[1]), d = cm(d[2]), t = total - lidT, lidT = lidT, model = model }
end

-- fractional position on the base (x, z in -0.5..0.5 of width/depth) at height y
local function at(D, fx: number, fz: number, y: number?): CFrame
	return CFrame.new(fx * D.w, y or 0, fz * D.d)
end

----------------------------------------------------------------------------------------------------
-- Builders
----------------------------------------------------------------------------------------------------
local function shellColor(D): Color3
	local c = D.model.color or { 60, 60, 66 }
	return Color3.fromRGB(c[1], c[2], c[3])
end

local function brandOf(D): string
	return string.upper(string.match(D.model.name or "", "^(%S+)") or "")
end

-- base shell: palm rest deck with touchpad and keyboard well, side walls, ports
local function buildBase(cf: CFrame, D): Model
	local m = newModel("Chassis", cf)
	local shell = shellColor(D)
	local w, d, t = D.w, D.d, D.t
	local deck = box(m, cf * CFrame.new(0, t / 2 - 0.006, 0), Vector3.new(w, 0.012, d), shell, M.Metal, { Name = "Deck" })
	deck:SetAttribute("Detail", "deck")
	-- side walls
	for _, x in { -w / 2 + 0.006, w / 2 - 0.006 } do
		box(m, cf * CFrame.new(x, 0, 0), Vector3.new(0.012, t, d), shell, M.Metal)
	end
	box(m, cf * CFrame.new(0, 0, d / 2 - 0.006), Vector3.new(w, t, 0.012), shell, M.Metal)
	box(m, cf * CFrame.new(0, 0, -d / 2 + 0.006), Vector3.new(w, t, 0.012), shell:Lerp(Color3.new(0, 0, 0), 0.25), M.Metal)
	-- inner frame (seen from below when the cover is off)
	box(m, cf * CFrame.new(0, t / 2 - 0.02, 0), Vector3.new(w - 0.03, 0.01, d - 0.03), Color3.fromRGB(40, 42, 46), M.Metal, { Name = "InnerFrame" })
	-- touchpad and keyboard well
	box(m, cf * at(D, 0, 0.25, t / 2 + 0.001), Vector3.new(w * 0.34, 0.003, d * 0.24), shell:Lerp(Color3.new(1, 1, 1), 0.08), M.Glass, { Name = "Touchpad" })
	box(m, cf * at(D, 0, -0.19, t / 2 + 0.0005), Vector3.new(w * 0.9, 0.002, d * 0.44), Color3.fromRGB(18, 18, 20), M.SmoothPlastic, { Name = "KeyboardWell" })
	-- ports on the sides
	for k = 0, 2 do
		box(m, cf * at(D, -0.5, -0.1 + k * 0.08, 0) * CFrame.new(-0.004, 0, 0), Vector3.new(0.006, t * 0.35, cm(1.3)), Color3.fromRGB(16, 16, 18))
		box(m, cf * at(D, 0.5, -0.05 + k * 0.08, 0) * CFrame.new(0.004, 0, 0), Vector3.new(0.006, t * 0.35, cm(1.3)), Color3.fromRGB(16, 16, 18))
	end
	-- speakers (front corners, inside)
	for _, fx in { -0.4, 0.4 } do
		box(m, cf * at(D, fx, 0.4, -t / 2 + 0.02), Vector3.new(cm(4), 0.012, cm(1.8)), Color3.fromRGB(20, 20, 22), M.SmoothPlastic)
	end
	-- power LED
	box(m, cf * at(D, 0.42, 0.495, t * 0.2), Vector3.new(cm(0.6), cm(0.15), 0.004), Color3.fromRGB(255, 255, 255), M.Neon, { Name = "PowerLed", Transparency = 0.7 })
	return m
end

local function buildBottomCover(cf: CFrame, D): Model
	local m = newModel("BottomCover", cf)
	local shell = shellColor(D):Lerp(Color3.new(0, 0, 0), 0.15)
	local w, d = D.w, D.d
	local plate = box(m, cf, Vector3.new(w - 0.004, 0.012, d - 0.004), shell, M.SmoothPlastic, { Name = "Plate" })
	plate:SetAttribute("Detail", "cover")
	-- intake vents (on the outer face, -Y)
	for r = 0, 5 do
		box(m, cf * at(D, -0.12, -0.32 + r * 0.035, -0.007), Vector3.new(w * 0.5, 0.004, cm(0.35)), Color3.fromRGB(12, 12, 14))
	end
	-- model sticker
	local sticker = box(m, cf * at(D, 0.25, 0.25, -0.007), Vector3.new(cm(6), 0.002, cm(3)), Color3.fromRGB(236, 236, 232), M.SmoothPlastic)
	sticker.CFrame = sticker.CFrame * DOWN
	PCParts.label(sticker, Enum.NormalId.Top, D.model.name or "", Color3.fromRGB(30, 30, 30), 300, nil)
	return m
end

local function buildFeet(cf: CFrame, D, peeled: boolean): Model
	local m = newModel("Feet", cf)
	for _, fz in { -0.42, 0.42 } do
		local foot = cf * at(D, 0, fz, -0.012)
		if peeled then
			-- peeled back strips curl up at one end
			box(m, foot * CFrame.new(-D.w * 0.2, -0.03, 0) * CFrame.Angles(0, 0, math.rad(-12)), Vector3.new(D.w * 0.38, cm(0.3), cm(1)), Color3.fromRGB(26, 26, 28), M.Rubber)
		else
			box(m, foot, Vector3.new(D.w * 0.76, cm(0.3), cm(1)), Color3.fromRGB(26, 26, 28), M.Rubber)
		end
		box(m, foot, Vector3.new(D.w * 0.76, 0.06, 0.14), Color3.new(0, 0, 0), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	end
	return m
end

local function swell(m: Model, cf: CFrame, w: number, h: number, d: number)
	local bulge = Instance.new("Part")
	bulge.Name = "Swelling"
	bulge.Anchored = true
	bulge.CanCollide = false
	bulge.CanTouch = false
	bulge.Size = Vector3.new(w * 0.9, h * 1.1, d * 0.85)
	bulge.CFrame = cf * CFrame.new(0, -h * 0.15, 0)
	bulge.Color = Color3.fromRGB(40, 40, 44)
	bulge.Material = M.SmoothPlastic
	local mesh = Instance.new("SpecialMesh")
	mesh.MeshType = Enum.MeshType.Sphere
	mesh.Parent = bulge
	bulge.Parent = m
end

local function buildBattery(cf: CFrame, D, swollen: boolean): Model
	local m = newModel("Battery", cf)
	local w, d, h = D.w * 0.8, D.d * 0.36, D.t * 0.55
	if D.model.class == "budget15" then
		w = D.w * 0.48
	end
	local body = box(m, cf, Vector3.new(w, h, d), Color3.fromRGB(28, 28, 30), M.SmoothPlastic, { Name = "Cells" })
	body:SetAttribute("Detail", "battery")
	if swollen then
		swell(m, cf, w, h, d)
	end
	local lab = box(m, cf * CFrame.new(0, -h / 2 - 0.002, 0), Vector3.new(w * 0.6, 0.003, d * 0.6), Color3.fromRGB(236, 236, 232), M.SmoothPlastic, { Name = "Label" })
	lab.CFrame = lab.CFrame * DOWN
	PCParts.label(lab, Enum.NormalId.Top, "Li-ion 11.4V\n" .. brandOf(D), Color3.fromRGB(30, 30, 30), 220, nil)
	-- the connector tail runs to the board (towards -Z)
	box(m, cf * CFrame.new(0, -h / 2 + 0.01, -d / 2 - cm(0.8)), Vector3.new(cm(2.4), 0.008, cm(1.6)), Color3.fromRGB(196, 150, 70), M.SmoothPlastic)
	return m
end


-- blower fan(s), heat pipes, fin stacks and the copper plate over the dies
local function buildCooling(cf: CFrame, D): Model
	local m = newModel("Cooling", cf)
	local gaming = D.model.class == "gaming15" or D.model.class == "gaming17"
	local copper = Color3.fromRGB(196, 116, 70)
	local fanXs = if gaming then { -0.32, 0.32 } else { 0.3 }
	local dia = D.w * (if gaming then 0.17 else 0.15)
	for _, fx in fanXs do
		local c = cf * at(D, fx, -0.02, 0)
		box(m, c, Vector3.new(dia * 1.08, D.t * 0.5, dia * 1.08), Color3.fromRGB(26, 26, 28), M.SmoothPlastic, { Name = "FanHousing" })
		local rotorCf = c * CFrame.new(0, -D.t * 0.25 - 0.002, 0)
		PCParts.rotor(m, rotorCf, dia * 0.92, Color3.fromRGB(40, 40, 44), Color3.fromRGB(60, 60, 64), 25)
		-- fin stack towards the back vent
		box(m, cf * at(D, fx, -0.15, 0), Vector3.new(dia * 1.05, D.t * 0.45, cm(1.6)), Color3.fromRGB(150, 150, 156), M.Metal, { Name = "Fins" })
		PCParts.dustLayer(m, cf * at(D, fx, -0.02, -D.t * 0.26), Vector3.new(dia * 1.1, 0.01, dia * 1.1))
	end
	-- heat pipes from the dies to each fin stack
	for k = 0, (if gaming then 2 else 1) do
		cyl(m, cf * at(D, 0, 0.07 + k * 0.025, -D.t * 0.2), "X", D.w * (if gaming then 0.7 else 0.4), cm(0.6), copper, M.Metal)
	end
	-- cold plate over CPU (+GPU)
	box(m, cf * at(D, 0, 0.1, -D.t * 0.15), Vector3.new(D.w * (if gaming then 0.3 else 0.16), cm(0.25), cm(4)), copper, M.Metal, { Name = "ColdPlate" })
	return m
end

-- logic board with the CPU/GPU dies, chips and (if wet) corrosion
local function buildBoard(cf: CFrame, D, paste, liquid: number): Model
	local m = newModel("LogicBoard", cf)
	local gaming = D.model.class == "gaming15" or D.model.class == "gaming17"
	local pcb = box(m, cf, Vector3.new(D.w * 0.92, cm(0.16), D.d * 0.52), Color3.fromRGB(20, 40, 30), M.SmoothPlastic, { Name = "PCB" })
	pcb:SetAttribute("Detail", "board")
	local under = -cm(0.08) - 0.002
	-- dies (under the cold plate) with paste
	local dies = { { -0.1, 0.2 } }
	if gaming then
		table.insert(dies, { 0.11, 0.2 })
	end
	for _, dpos in dies do
		local c = cf * CFrame.new(dpos[1] * D.w, under, (dpos[2] - 0.22) * D.d)
		box(m, c, Vector3.new(cm(2.4), 0.008, cm(2.4)), Color3.fromRGB(32, 110, 60), M.SmoothPlastic)
		box(m, c * CFrame.new(0, -0.005, 0), Vector3.new(cm(1.4), 0.006, cm(1.2)), Color3.fromRGB(60, 60, 70), M.Glass, { Name = "Die" })
		if paste and paste.st ~= "clean" and paste.st ~= "none" then
			local blob = cyl(m, c * CFrame.new(0, -0.01, 0), "Y", 0.004, cm(if paste.st == "fresh" then 1 else 1.5), if paste.st == "dry" then Color3.fromRGB(200, 200, 196) else Color3.fromRGB(140, 142, 150), M.SmoothPlastic, { Name = "Paste", CastShadow = false })
			blob:SetAttribute("Paste", paste.st)
		end
	end
	-- chips, connectors
	for k = 0, 5 do
		box(m, cf * CFrame.new((-0.35 + k * 0.14) * D.w, under, 0.12 * D.d), Vector3.new(cm(1.2), 0.008, cm(1.2)), Color3.fromRGB(16, 16, 18))
	end
	-- liquid damage: green-white corrosion blotches
	if liquid > 0.02 then
		for k = 0, 3 do
			local stain = PCParts.box(m, cf * CFrame.new((-0.25 + k * 0.17) * D.w, under - 0.003, (-0.05 + (k % 2) * 0.1) * D.d), Vector3.new(cm(3 + k), 0.003, cm(2.2 + k * 0.6)), Color3.fromRGB(150, 190, 150), M.Slate, { Name = "Corrosion", CastShadow = false })
			stain.Transparency = math.clamp(1 - liquid * 1.6, 0.05, 0.9)
		end
	end
	return m
end

local function buildKeyboard(cf: CFrame, D): Model
	local m = newModel("Keyboard", cf)
	local w, d = D.w * 0.88, D.d * 0.42
	box(m, cf, Vector3.new(w, 0.01, d), Color3.fromRGB(26, 26, 28), M.Metal, { Name = "Plate" })
	local rows = 6
	local cols = 15
	local pitchX = w / cols
	local pitchZ = d / rows
	local key = Color3.fromRGB(34, 34, 38)
	for r = 0, rows - 1 do
		local n = if r == 5 then 9 else cols
		for c = 0, n - 1 do
			local kw = pitchX * 0.86
			local x = -w / 2 + pitchX * (c + 0.5)
			if r == 5 and c == 4 then
				kw = pitchX * 5.4 -- space bar
				x = -w / 2 + pitchX * 6.9
			elseif r == 5 and c > 4 then
				x = -w / 2 + pitchX * (c + 5.5)
			end
			if r == 5 and c > 4 and x > w / 2 then
				break
			end
			box(m, cf * CFrame.new(x, 0.007, -d / 2 + pitchZ * (r + 0.5)), Vector3.new(kw, 0.008, pitchZ * 0.84), key, M.SmoothPlastic, { CastShadow = false })
		end
	end
	return m
end

-- lid shell (the outer A-cover with the logo)
local function buildLid(cf: CFrame, D): Model
	local m = newModel("Lid", cf)
	local shell = shellColor(D)
	local w, d, lt = D.w, D.d, D.lidT
	local back = box(m, cf * CFrame.new(0, lt * 0.62, d / 2), Vector3.new(w, lt * 0.76, d), shell, M.Metal, { Name = "Cover" })
	back:SetAttribute("Detail", "lid")
	local logo = box(m, cf * CFrame.new(0, lt + 0.001, d * 0.5), Vector3.new(cm(8), 0.002, cm(2.4)), shell:Lerp(Color3.new(1, 1, 1), 0.4), M.Metal, { Name = "Logo" })
	PCParts.label(logo, Enum.NormalId.Top, brandOf(D), Color3.fromRGB(230, 230, 230), 300, nil)
	-- the inner face behind the panel
	box(m, cf * CFrame.new(0, lt * 0.22, d / 2), Vector3.new(w - 0.01, lt * 0.06, d - 0.01), Color3.fromRGB(20, 20, 22), M.SmoothPlastic)
	return m
end

local function buildBezel(cf: CFrame, D): Model
	local m = newModel("Bezel", cf)
	local w, d = D.w, D.d
	local col = Color3.fromRGB(14, 14, 16)
	local y = -0.002
	box(m, cf * CFrame.new(0, y, cm(1)), Vector3.new(w, 0.012, cm(2)), col)
	box(m, cf * CFrame.new(0, y, d - cm(0.5)), Vector3.new(w, 0.012, cm(1)), col)
	box(m, cf * CFrame.new(-w / 2 + cm(0.6), y, d / 2), Vector3.new(cm(1.2), 0.012, d), col)
	box(m, cf * CFrame.new(w / 2 - cm(0.6), y, d / 2), Vector3.new(cm(1.2), 0.012, d), col)
	cyl(m, cf * CFrame.new(0, y - 0.002, d - cm(0.5)), "Y", 0.002, cm(0.4), Color3.fromRGB(30, 40, 60), M.Glass)
	box(m, cf * CFrame.new(0, y, d / 2), Vector3.new(w, 0.02, d), Color3.new(0, 0, 0), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

local function buildScreen(cf: CFrame, D, cracked: boolean): Model
	local m = newModel("Screen", cf)
	local w, d = D.w - cm(1.6), D.d - cm(2.4)
	box(m, cf * CFrame.new(0, cm(0.18), d / 2 + cm(1.4)), Vector3.new(w, cm(0.3), d), Color3.fromRGB(150, 152, 158), M.Metal, { Name = "PanelBack" })
	local face = box(m, cf * CFrame.new(0, 0.004, d / 2 + cm(1.4)), Vector3.new(w - cm(0.6), 0.004, d - cm(0.6)), Color3.fromRGB(8, 10, 14), M.Glass, { Name = "Face" })
	face:SetAttribute("Screen", true)
	if cracked then
		local c0 = cf * CFrame.new(w * 0.15, 0.001, d * 0.55)
		for k = 0, 7 do
			local a = k * math.pi / 4 + 0.3
			local len = (0.25 + (k % 3) * 0.12) * d
			box(m, c0 * CFrame.Angles(0, a, 0) * CFrame.new(len / 2, 0, 0), Vector3.new(len, 0.002, 0.01), Color3.fromRGB(220, 230, 240), M.Neon, { Name = "Crack", CastShadow = false, Transparency = 0.2 })
		end
	end
	return m
end

local function buildHinges(cf: CFrame, D, broken: boolean): Model
	local m = newModel("Hinges", cf)
	for i, x in { -D.w / 2 + cm(3.5), D.w / 2 - cm(3.5) } do
		local c = cf * CFrame.new(x, 0, 0)
		if broken and i == 2 then
			c = c * CFrame.Angles(math.rad(18), 0, 0)
		end
		cyl(m, c, "X", cm(3), cm(0.7), Color3.fromRGB(60, 60, 66), M.Metal)
		box(m, c * CFrame.new(0, cm(0.25), cm(1.6)), Vector3.new(cm(2.4), cm(0.15), cm(3)), Color3.fromRGB(150, 150, 156), M.Metal, { Name = "Plate" })
		if broken and i == 2 then
			box(m, c * CFrame.new(0, cm(0.3), cm(1.2)), Vector3.new(cm(1.5), 0.004, 0.01), Color3.fromRGB(240, 240, 240), M.SmoothPlastic, { Name = "Crack" })
		end
	end
	return m
end

local function buildDcJack(cf: CFrame): Model
	local m = newModel("DCJack", cf)
	box(m, cf, Vector3.new(cm(1.4), cm(1), cm(1.8)), Color3.fromRGB(26, 26, 28), M.SmoothPlastic, { Name = "Body" })
	cyl(m, cf * CFrame.new(-cm(0.72), 0, 0), "X", 0.004, cm(0.55), Color3.fromRGB(176, 180, 186), M.Metal)
	box(m, cf, Vector3.new(0.14, 0.08, 0.16), Color3.new(0, 0, 0), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

local function buildWifi(cf: CFrame): Model
	local m = newModel("WiFi", cf)
	box(m, cf, Vector3.new(cm(2.2), cm(0.15), cm(3)), Color3.fromRGB(20, 60, 36), M.SmoothPlastic)
	local shield = box(m, cf * CFrame.new(0, -cm(0.12), -cm(0.2)), Vector3.new(cm(1.8), cm(0.1), cm(2)), Color3.fromRGB(180, 184, 190), M.Metal, { Name = "Shield" })
	PCParts.label(shield, Enum.NormalId.Bottom, "Wi-Fi 6", Color3.fromRGB(30, 30, 30), 600, nil)
	for _, x in { -cm(0.5), cm(0.5) } do
		cyl(m, cf * CFrame.new(x, -cm(0.15), cm(1)), "Y", cm(0.15), cm(0.45), Color3.fromRGB(196, 170, 90), M.Metal)
	end
	box(m, cf, Vector3.new(0.18, 0.06, 0.24), Color3.new(0, 0, 0), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

local function buildCoin(cf: CFrame): Model
	local m = newModel("CMOS", cf)
	cyl(m, cf, "Y", cm(0.35), cm(2.1), Color3.fromRGB(20, 20, 22), M.SmoothPlastic)
	cyl(m, cf * CFrame.new(0, -cm(0.18), 0), "Y", 0.003, cm(1.6), Color3.fromRGB(70, 140, 220), M.SmoothPlastic)
	box(m, cf, Vector3.new(0.16, 0.06, 0.16), Color3.new(0, 0, 0), M.SmoothPlastic, { Name = "Hitbox", Transparency = 1 })
	return m
end

----------------------------------------------------------------------------------------------------
-- describe
----------------------------------------------------------------------------------------------------
function LaptopLayout.describe(view, _opts)
	local D = LaptopLayout.dims(view)
	local d, t, lt = D.d, D.t, D.lidT
	local nodes = {}
	local order = {}
	local visible = view.visible or {}
	local flipped = view.orient == "bottom"
	local lidOpen = view.lid == "open"

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
	local function comp(id: string, parent: string, home: CFrame, builder: (CFrame, any) -> Model, extra: { [string]: any }?)
		local s = view.nodes[id]
		local part = partOf(view, id)
		if not s or s.st == "empty" or not part or not Rules.available(view, id) then
			return add(id, { hide = true })
		end
		local spec = {
			parent = parent,
			home = home,
			out = s.st == "out",
			offset = if s.st == "loose" then CFrame.new(0, -0.04, 0) else nil,
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

	-- the chassis rests on its feet, or upside down on the closed lid
	local feetH = cm(0.3)
	local baseHome = if flipped then CFrame.new(0, lt + t / 2, 0) * CFrame.Angles(0, 0, math.pi) else CFrame.new(0, feetH + t / 2, 0)
	add("base", {
		kind = "root",
		home = baseHome,
		sig = "base:" .. tostring(view.model),
		build = function(cf)
			return buildBase(cf, D)
		end,
	})
	add("lid", {
		kind = "lid",
		parent = "base",
		home = CFrame.new(0, t / 2, -d / 2 + cm(0.4)) * (if lidOpen then CFrame.Angles(math.rad(-108), 0, 0) else CFrame.new()),
		sig = "lid:" .. tostring(view.model),
		build = function(cf)
			return buildLid(cf, D)
		end,
	})
	add("lboard", {
		kind = "board",
		parent = "base",
		home = at(D, 0, -0.22, t * 0.12),
		sig = "board:" .. tostring(view.paste and view.paste.st) .. ":" .. tostring(math.floor((view.liquid or 0) * 10)),
		build = function(cf)
			return buildBoard(cf, D, view.paste, view.liquid or 0)
		end,
	})

	-- bottom cover with its feet and screws
	local coverSt = st("bottom_cover")
	add("bottom_cover", {
		kind = "panel",
		parent = "base",
		home = CFrame.new(0, -t / 2 - 0.006, 0),
		offset = if coverSt == "loose" then CFrame.new(0, -0.05, 0) * CFrame.Angles(math.rad(3), 0, 0) else nil,
		out = coverSt == "out",
		lean = true,
		sig = "cover:" .. tostring(view.model),
		build = function(cf)
			return buildBottomCover(cf, D)
		end,
	})
	if Rules.available(view, "feet") then
		local peeled = st("feet") == "peeled"
		add("feet", {
			kind = "feet",
			parent = "bottom_cover",
			home = CFrame.new(),
			sig = "feet:" .. tostring(peeled),
			build = function(cf)
				return buildFeet(cf, D, peeled)
			end,
		})
	else
		add("feet", { hide = true })
	end
	local coverScrews = {}
	for _, p in { { -0.44, -0.46 }, { -0.22, -0.46 }, { 0, -0.46 }, { 0.22, -0.46 }, { 0.44, -0.46 }, { -0.44, 0.46 }, { -0.15, 0.46 }, { 0.15, 0.46 }, { 0.44, 0.46 }, { 0, 0.05 } } do
		table.insert(coverScrews, at(D, p[1], p[2], -0.006) * DOWN)
	end
	table.insert(coverScrews, at(D, -0.3, -0.42, -0.006) * DOWN)
	table.insert(coverScrews, at(D, 0.3, -0.42, -0.006) * DOWN)
	screws("bottom_cover", coverScrews)

	-- internals (drawn facing down)
	local yIn = -t / 2 + cm(0.25)
	local swollen = visible.battery == "swollen"
	local budget = D.model.class == "budget15"
	comp("battery", "base", at(D, if budget then -0.2 else 0, 0.27, -t * 0.12), function(cf)
		return buildBattery(cf, D, swollen)
	end, { sig = "battery:" .. tostring(view.nodes.battery and view.nodes.battery.part) .. ":" .. tostring(swollen) })
	local bw = if budget then D.w * 0.48 else D.w * 0.8
	local bh = D.t * 0.55
	screws("battery", {
		CFrame.new(-bw / 2 + cm(1), -bh / 2, -D.d * 0.15) * DOWN,
		CFrame.new(bw / 2 - cm(1), -bh / 2, -D.d * 0.15) * DOWN,
		CFrame.new(-bw / 2 + cm(1), -bh / 2, D.d * 0.15) * DOWN,
		CFrame.new(bw / 2 - cm(1), -bh / 2, D.d * 0.15) * DOWN,
	})

	for i = 1, 2 do
		local id = "lram" .. i
		local slot = at(D, -0.13 + (i - 1) * 0.24, -0.1, yIn + cm(0.2))
		comp(id, "base", slot * CFrame.Angles(math.pi / 2, 0, 0) * CFrame.Angles(0, math.pi / 2, 0) * CFrame.Angles(0, 0, math.pi), function(cf, p)
			return PCParts.ram(cf, p)
		end)
		local clipId = id .. "_clip"
		if Rules.available(view, clipId) then
			local open = st(clipId) == "open"
			add(clipId, {
				kind = "latch",
				parent = "base",
				home = slot * CFrame.new(-cm(4), 0, cm(2.2)) * DOWN,
				offset = if open then CFrame.Angles(0, 0, math.rad(-40)) else nil,
				sig = "clip",
				build = function(cf)
					return PCParts.latch(cf, "ram")
				end,
			})
		else
			add(clipId, { hide = true })
		end
	end

	local nvmeHome = at(D, 0.37, -0.06, yIn) * CFrame.Angles(0, 0, math.pi)
	comp("lnvme", "base", nvmeHome, function(cf, p)
		return PCParts.storage(cf, p)
	end)
	local nd = PCParts.storageDims(partOf(view, "lnvme") or Parts.get("st_nv500sn580"))
	screws("lnvme", { CFrame.new(-nd.X / 2 + cm(0.15), cm(0.35), 0) })

	comp("lsata", "base", at(D, 0.26, 0.27, yIn) * CFrame.Angles(0, 0, math.pi), function(cf, p)
		return PCParts.storage(cf, p)
	end)
	local sd = PCParts.storageDims(partOf(view, "lsata") or Parts.get("st_hdd25_500"))
	screws("lsata", {
		CFrame.new(-sd.X / 2 + cm(1), sd.Y, -sd.Z / 2 + cm(0.8)),
		CFrame.new(-sd.X / 2 + cm(1), sd.Y, sd.Z / 2 - cm(0.8)),
	})

	comp("lwifi", "base", at(D, -0.38, -0.08, yIn), function(cf)
		return buildWifi(cf)
	end)
	screws("lwifi", { CFrame.new(0, -cm(0.1), -cm(1.4)) * DOWN })

	comp("lfan", "base", at(D, 0, -0.3, -t * 0.08), function(cf)
		return buildCooling(cf, D)
	end)
	local fanScrews = {}
	for k = 1, 5 do
		local fx = -0.36 + (k - 1) * 0.18
		table.insert(fanScrews, CFrame.new(fx * D.w, -t * 0.26, 0.12 * D.d) * DOWN)
	end
	screws("lfan", fanScrews)

	comp("lcmos", "base", at(D, -0.44, 0.02, yIn), function(cf)
		return buildCoin(cf)
	end)

	comp("dcjack", "base", at(D, -0.47, -0.4, 0), function(cf)
		return buildDcJack(cf)
	end, { offset = if st("dcjack") == "loose" then CFrame.new(0, -0.04, 0) else nil })
	screws("dcjack", { CFrame.new(cm(0.4), -cm(0.6), 0) * DOWN })

	-- keyboard on the deck; its screws are reached from below, under the battery
	comp("keyboard", "base", at(D, 0, -0.19, t / 2 + 0.006), function(cf)
		return buildKeyboard(cf, D)
	end, { offset = if st("keyboard") == "loose" then CFrame.new(0, 0.05, 0) else nil, outRot = CFrame.new() })
	local kbScrews = {}
	for _, p in { { -0.3, 0.42 }, { -0.1, 0.42 }, { 0.1, 0.42 }, { 0.3, 0.42 }, { -0.2, 0.7 }, { 0.2, 0.7 } } do
		table.insert(kbScrews, CFrame.new(p[1] * D.w, -t + cm(0.3), p[2] * D.d) * DOWN)
	end
	screws("keyboard", kbScrews)

	-- lid side: bezel over the panel, panel screws, hinges
	local bezelSt = st("bezel")
	add("bezel", {
		kind = "panel",
		parent = "lid",
		home = CFrame.new(),
		out = bezelSt == "out",
		sig = "bezel:" .. tostring(view.model),
		build = function(cf)
			return buildBezel(cf, D)
		end,
	})
	local cracked = visible.screen == "cracked" or visible.screen == "broken"
	comp("screen", "lid", CFrame.new(0, 0.002, 0), function(cf)
		return buildScreen(cf, D, cracked)
	end, { sig = "screen:" .. tostring(view.nodes.screen and view.nodes.screen.part) .. ":" .. tostring(cracked) })
	local sw2, sd2 = (D.w - cm(1.6)) / 2 - cm(0.6), D.d - cm(1.6)
	screws("screen", {
		CFrame.new(-sw2, 0.012, cm(1.9)) * DOWN,
		CFrame.new(sw2, 0.012, cm(1.9)) * DOWN,
		CFrame.new(-sw2, 0.012, sd2) * DOWN,
		CFrame.new(sw2, 0.012, sd2) * DOWN,
	})
	local brokenHinge = visible.hinges == "broken"
	comp("hinges", "lid", CFrame.new(0, 0, 0), function(cf)
		return buildHinges(cf, D, brokenHinge)
	end, { sig = "hinges:" .. tostring(view.nodes.hinges and view.nodes.hinges.part) .. ":" .. tostring(brokenHinge) })
	screws("hinges", {
		CFrame.new(-D.w / 2 + cm(3), 0.012, cm(1.2)) * DOWN,
		CFrame.new(-D.w / 2 + cm(4), 0.012, cm(1.2)) * DOWN,
		CFrame.new(D.w / 2 - cm(4), 0.012, cm(1.2)) * DOWN,
		CFrame.new(D.w / 2 - cm(3), 0.012, cm(1.2)) * DOWN,
	})

	for _, id in T.order do
		if not nodes[id] and T.nodes[id].kind ~= "cable" then
			add(id, { hide = true })
		end
	end
	return { base = CFrame.new(-0.4, 0, 0), order = order, nodes = nodes, cables = LaptopLayout.cables(view, D) }
end

----------------------------------------------------------------------------------------------------
-- Cables: short runs lying on the board; plugs face down (away from the deck)
----------------------------------------------------------------------------------------------------
function LaptopLayout.cables(view, D)
	local list = {}
	local t = D.t
	local yIn = -t / 2 + cm(0.25)
	local function cable(id: string, style: string, fromNode: string, fromRel: CFrame, toNode: string, toRel: CFrame)
		if not Rules.available(view, id) then
			return
		end
		local tn = T.nodes[id]
		local s = view.nodes[id]
		local plugged = s and s.st == "in"
		local a = view.nodes[tn.ends[1]]
		local b = view.nodes[tn.ends[2]]
		local endsIn = (tn.ends[1] == "base" or (a and a.st == "in")) and (tn.ends[2] == "base" or (b and b.st == "in"))
		if not plugged and not endsIn then
			return
		end
		table.insert(list, {
			id = id,
			style = style,
			route = function(h)
				local fw = h:worldOf(fromNode)
				local tw = h:worldOf(toNode)
				if not fw or not tw then
					return nil
				end
				local head = tw * toRel
				if not plugged then
					head = head * CFrame.new(0, 0.12, -0.05) * CFrame.Angles(math.rad(30), 0, 0)
				end
				local p0 = (fw * fromRel).Position
				local p1 = (head * CFrame.new(0, PCParts.CableStyle[style].head[2], 0)).Position
				return { p0, p0:Lerp(p1, 0.5), p1 }, head
			end,
		})
	end
	local function base(fx: number, fz: number, y: number?): CFrame
		return at(D, fx, fz, y or yIn) * DOWN
	end
	cable("bat_conn", "thin", "battery", CFrame.new(0, -t * 0.25, -D.d * 0.18), "base", base(0, 0.06))
	cable("lsata_conn", "ribbon", "lsata", CFrame.new(cm(5), cm(0.4), 0), "base", base(0.16, 0.13))
	cable("lwifi_ant", "thin", "lwifi", CFrame.new(0, -cm(0.2), cm(1)), "base", base(-0.38, -0.45))
	cable("lfan_conn", "thin", "lfan", CFrame.new(D.w * 0.22, -t * 0.25, D.d * 0.05), "base", base(0.2, -0.12))
	cable("lcmos_conn", "thin", "lcmos", CFrame.new(cm(1), 0, 0), "base", base(-0.36, 0.02))
	cable("dc_conn", "thin", "dcjack", CFrame.new(cm(0.7), 0, cm(0.6)), "base", base(-0.36, -0.36))
	cable("kb_ribbon", "ribbon", "keyboard", CFrame.new(0, -0.02, D.d * 0.2), "base", base(0, 0.16, -t / 2 + cm(0.6)))
	cable("edp_conn", "ribbon", "lid", CFrame.new(0, cm(0.3), cm(0.3)), "screen", CFrame.new(0, 0.006, cm(0.9)) * DOWN)
	return list
end

function LaptopLayout.decorate(handle, view)
	for id, rec in handle.recs do
		if rec.model then
			local s = view.nodes[id]
			local dust = s and s.dust or 0
			for _, d in rec.model:GetDescendants() do
				if d:IsA("BasePart") and d:GetAttribute("Dust") then
					d.Transparency = 1 - math.clamp((dust - 0.03) * 3.2, 0, 0.9)
				end
			end
		end
	end
end

return LaptopLayout
