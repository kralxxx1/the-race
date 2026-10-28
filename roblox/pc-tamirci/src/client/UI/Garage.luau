-- Garage: the dealerships (a turning 3D preview, stats, colours, buying) and your own vehicles
-- (call one to the nearest road, park it).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Vehicles = require(Shared.Data.Vehicles)
local VehicleModels = require(Shared.Models.VehicleModels)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local Garage = {}

local KIND_ICON = { bicycle = "🚲", scooter = "🛴", bike = "🏍️", car = "🚗" }

local function iconOf(def): string
	if def.body == "van" or def.body == "minibus" then
		return "🚐"
	elseif def.body == "pickup" or def.body == "suv" then
		return "🚙"
	elseif def.body == "super" or def.body == "coupe" then
		return "🏎️"
	end
	return KIND_ICON[def.kind] or "🚗"
end

local function call(id: string)
	local r = Net.request("vehicle.spawn", { id = id })
	if App.report(r, S.t("vehicle_called")) then
		Kit.closeWindow()
		Hud.toast(S.t("drive_hint"), "info", 6)
	end
end

-- A 3D turntable of `def` in `color` inside `parent`. Returns a function that swaps the shown
-- vehicle/colour and a stop function.
local function turntable(parent: Instance)
	local vp = Instance.new("ViewportFrame")
	vp.Size = UDim2.fromScale(1, 1)
	vp.BackgroundColor3 = Color3.fromRGB(30, 34, 44)
	vp.Ambient = Color3.fromRGB(150, 152, 160)
	vp.LightColor = Color3.fromRGB(255, 248, 236)
	vp.LightDirection = Vector3.new(-0.6, -1, -0.4)
	vp.Parent = parent
	Kit.corner(vp)
	local world = Instance.new("WorldModel")
	world.Parent = vp
	local cam = Instance.new("Camera")
	cam.FieldOfView = 40
	cam.Parent = vp
	vp.CurrentCamera = cam
	-- showroom floor
	local floor = Instance.new("Part")
	floor.Anchored = true
	floor.Size = Vector3.new(40, 0.2, 40)
	floor.CFrame = CFrame.new(0, -0.1, 0)
	floor.Color = Color3.fromRGB(60, 64, 76)
	floor.Material = Enum.Material.SmoothPlastic
	floor.Parent = world
	local model: Model? = nil
	local size = Vector3.new(6, 4, 12)
	local angle = 0.8
	local function show(def, color: number)
		if model then
			model:Destroy()
		end
		local ok, m = pcall(VehicleModels.build, world, def, CFrame.new(), { color = color, plate = "34 PC 001", static = true })
		if ok then
			model = m
			local _, s = m:GetBoundingBox()
			size = s
		else
			warn("[Garage] " .. tostring(m))
		end
	end
	local conn = RunService.RenderStepped:Connect(function(dt)
		angle += dt * 0.45
		local radius = math.max(size.X, size.Z) * 1.35 + 3
		local focus = Vector3.new(0, size.Y * 0.4, 0)
		cam.CFrame = CFrame.lookAt(focus + Vector3.new(math.sin(angle) * radius, size.Y * 0.55 + 2, math.cos(angle) * radius), focus)
	end)
	return show, function()
		conn:Disconnect()
	end
end

local function statBar(parent: Instance, label: string, value: number, max: number, order: number)
	local row = Kit.frame(parent, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 20), LayoutOrder = order })
	Kit.label(row, label, { Size = UDim2.new(0, 120, 1, 0), TextSize = 14, TextColor3 = Theme.dim })
	local bar = Kit.progress(row, { Size = UDim2.new(1, -130, 0, 10), Position = UDim2.new(0, 130, 0.5, -5) }, Theme.accent)
	bar:set(value / max)
end

-- Dealership window.
function Garage.dealer(payload)
	local dealer = payload.dealer
	local list = {}
	for _, v in Vehicles.list do
		if v.dealer == dealer then
			table.insert(list, v)
		end
	end
	table.sort(list, function(a, b)
		return a.price < b.price
	end)
	local stop
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🚘 " .. S.pick(Vehicles.dealers[dealer]), Vector2.new(980, 600), function()
		if stop then
			stop()
		end
		if conn then
			conn:Disconnect()
		end
		task.spawn(Net.request, "market.close")
	end)
	local c = win.content
	local left = Kit.list(c, { Size = UDim2.new(0, 360, 1, 0) })
	local right = Kit.frame(c, { BackgroundTransparency = 1, Size = UDim2.new(1, -376, 1, 0), Position = UDim2.fromOffset(376, 0) })
	local view = Kit.frame(right, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0.52, 0) })
	local show
	show, stop = turntable(view)
	local info = Kit.frame(right, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0.48, -8), Position = UDim2.new(0, 0, 0.52, 8) })
	Kit.listLayout(info, 6)

	local selected = list[1]
	local color = 1
	local rows = {}
	local function render()
		Kit.clear(info)
		local def = selected
		if not def then
			return
		end
		local d = State.data
		local owned = d and d.vehicles[def.id]
		Kit.label(info, iconOf(def) .. " <b>" .. S.pick(def.name) .. "</b>", { TextSize = 22, LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 28) })
		Kit.label(info, S.t("vehicle_speed", { n = def.speed }) .. " " .. S.t("kmh") .. "   •   " .. S.t("vehicle_seats", { n = def.seats }) .. "   •   " .. S.t("level") .. " " .. (def.level or 1), { TextSize = 14, TextColor3 = Theme.dim, LayoutOrder = 2 })
		statBar(info, "⚡ " .. S.t("vehicle_speed", { n = "" }), def.speed, 140, 3)
		statBar(info, "🚀 0-100", def.accel, 80, 4)
		statBar(info, "🎯 " .. (if S.lang() == "en" then "Handling" else "Yol tutuş"), def.turn, 3.6, 5)
		-- colours
		local swatches = Kit.frame(info, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 34), LayoutOrder = 6 })
		Kit.listLayout(swatches, 6, true)
		for i, rgb in def.colors do
			local b = Kit.button(swatches, "", function()
				color = i
				show(def, i)
				render()
			end, { Size = UDim2.fromOffset(30, 30), LayoutOrder = i })
			Kit.setColor(b, Color3.fromRGB(rgb[1], rgb[2], rgb[3]))
			Kit.corner(b, UDim.new(1, 0))
			if i == color then
				Kit.outline(b, Color3.new(1, 1, 1), 3, 0)
			end
		end
		local buttons = Kit.frame(info, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 46), LayoutOrder = 7 })
		Kit.listLayout(buttons, 8, true)
		if owned then
			Kit.pill(buttons, "✔ " .. S.t("owned"), Theme.good, { LayoutOrder = 1 })
			Kit.button(buttons, "📍 " .. S.t("vehicle_call"), function()
				call(def.id)
			end, { Size = UDim2.fromOffset(180, 42), LayoutOrder = 2 }, "primary")
		else
			local locked = (d and d.level or 1) < (def.level or 1)
			local b = Kit.button(buttons, if locked then S.t("needs_level", { n = def.level }) else S.t("dealer_buy", { price = S.money(def.price) }), function()
				local r = Net.request("vehicle.buy", { id = def.id, color = color })
				if App.report(r, S.t("bought", { name = S.pick(def.name) })) then
					Hud.banner(iconOf(def) .. " " .. S.pick(def.name))
				end
			end, { Size = UDim2.fromOffset(260, 42), LayoutOrder = 1 }, "good")
			Kit.setEnabled(b, not locked and d ~= nil and d.money >= def.price)
		end
	end
	local function choose(def)
		selected = def
		color = 1
		local d = State.data
		local mine = d and d.vehicles[def.id]
		if mine and mine.color then
			color = mine.color
		end
		for id, row in rows do
			Kit.outline(row, if id == def.id then Theme.accent else Theme.line, if id == def.id then 2 else 1, if id == def.id then 0 else 0.6)
		end
		show(def, color)
		render()
	end
	for i, def in list do
		local row, r = Kit.row(left, iconOf(def), S.pick(def.name), S.money(def.price) .. "  •  " .. S.t("level") .. " " .. (def.level or 1), { LayoutOrder = i })
		local d = State.data
		if d and d.vehicles[def.id] then
			Kit.pill(r, "✔", Theme.good)
		end
		local hit = Instance.new("TextButton")
		hit.BackgroundTransparency = 1
		hit.Text = ""
		hit.Size = UDim2.fromScale(1, 1)
		hit.ZIndex = 3
		hit.Parent = row
		hit.Activated:Connect(function()
			choose(def)
		end)
		rows[def.id] = row
	end
	if selected then
		choose(selected)
	end
	conn = State.changed:Connect(render)
end

-- Your vehicles (from the phone).
function Garage.open()
	local win = Kit.window(App.screen :: ScreenGui, "🚗 " .. S.t("garage_title"), Vector2.new(620, 520))
	local c = win.content
	Kit.button(c, "🅿️ " .. S.t("vehicle_park"), function()
		Net.request("vehicle.despawn")
		win.close()
	end, { Size = UDim2.fromOffset(160, 34), Position = UDim2.new(1, -160, 0, 0) }, "ghost")
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -44), Position = UDim2.fromOffset(0, 42) })
	local n = 0
	local owned = State.data and State.data.vehicles or {}
	for _, def in Vehicles.list do
		if owned[def.id] then
			n += 1
			local _, right = Kit.row(list, iconOf(def), S.pick(def.name), S.t("vehicle_speed", { n = def.speed }) .. " " .. S.t("kmh") .. " • " .. S.t("vehicle_seats", { n = def.seats }), { LayoutOrder = n })
			Kit.button(right, "📍 " .. S.t("vehicle_call"), function()
				call(def.id)
			end, { Size = UDim2.fromOffset(130, 36) }, "primary")
		end
	end
	if n == 0 then
		Kit.label(list, S.t("vehicle_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
	end
end

function Garage.init()
	Net.on("dealer.open", Garage.dealer)
end

return Garage
