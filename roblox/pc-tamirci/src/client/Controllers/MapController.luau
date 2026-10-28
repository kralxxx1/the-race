-- MapController: the city map (M), the corner minimap and GPS directions.
--
-- Both maps are drawn from CityLayout (the same deterministic plan the server built the world
-- from), so nothing has to be streamed in to show far-away places. Positions use scale
-- coordinates inside a canvas: zooming only resizes the canvas, icons keep their size.
-- GPS routes run over the road graph; on the ground a trail of glowing arrows leads the way.

local Players = game:GetService("Players")
local GuiService = game:GetService("GuiService")
local RunService = game:GetService("RunService")
local UserInputService = game:GetService("UserInputService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local Net = require(Shared.Net)
local CityLayout = require(Shared.World.CityLayout)
local Locations = require(Shared.Data.Locations)

local Client = script.Parent.Parent
local Kit = require(Client.UI.Kit)
local Theme = require(Client.UI.Theme)
local Hud = require(Client.UI.Hud)
local App = require(Client.UI.App)
local S = require(Client.Strings)

local MapController = {}

local player = Players.LocalPlayer
local L
local minX, minZ, W, H = 0, 0, 1, 1

local mapRoot: Frame? = nil
local viewport: Frame
local canvas: Frame
local nameLabels: { TextLabel } = {}
local plotMarks: { [number]: Frame } = {}
local miniPlotMarks: { [number]: Frame } = {}
local info: Frame
local zoom = 1
local baseScale = 0.3
local arrow: TextLabel
local othersHolder: Frame

local mini: Frame
local miniCanvas: Frame
local miniArrow: TextLabel
local MINI_SCALE = 0.42 -- pixels per stud on the minimap
local MINI_SIZE = 210
local gpsLabel: TextLabel

local gps = { target = nil :: Vector3?, name = "", points = {} :: { Vector3 } }
local routeFolders: { Frame } = {}
local trail: Folder
local arrows: { { BasePart } } = {}
local beacon: BasePart?

local function rgb(t): Color3
	return Color3.fromRGB(t[1], t[2], t[3])
end

local function sx(x: number): number
	return (x - minX) / W
end

local function sz(z: number): number
	return (z - minZ) / H
end

local function myRoot(): BasePart?
	local char = player.Character
	return char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
end

local function myPos(): Vector3?
	local root = myRoot()
	if root then
		return root.Position
	end
	local cam = Workspace.CurrentCamera
	return cam and cam.Focus.Position or nil
end

-- Screen pixels per GUI offset unit (Kit.screen shrinks the UI on small screens).
local function uiScale(): number
	local sc = App.screen and App.screen:FindFirstChildOfClass("UIScale")
	return if sc then sc.Scale else 1
end

-- Input positions don't include the top bar inset; our ScreenGui ignores it.
local function screenPoint(input: InputObject): Vector2
	local inset = GuiService:GetGuiInset()
	return Vector2.new(input.Position.X, input.Position.Y) + inset
end

local function heading(): number
	local cam = Workspace.CurrentCamera
	local look = if cam then cam.CFrame.LookVector else Vector3.new(0, 0, -1)
	return math.deg(math.atan2(look.X, -look.Z))
end

----------------------------------------------------------------------------------------------------
-- Drawing the city
----------------------------------------------------------------------------------------------------
local function rect(parent: Instance, x0: number, z0: number, x1: number, z1: number, color: Color3, zi: number): Frame
	local f = Instance.new("Frame")
	f.BorderSizePixel = 0
	f.BackgroundColor3 = color
	f.Position = UDim2.fromScale(sx(x0), sz(z0))
	f.Size = UDim2.fromScale((x1 - x0) / W, (z1 - z0) / H)
	f.ZIndex = zi
	f.Parent = parent
	return f
end

local function plotCenter(p): Vector3
	return (p.cf * CFrame.new(0, 0, p.depth / 2)).Position
end

local function poiColor(poi): Color3
	local cat = poi.def and Locations.categories[poi.def.cat]
	return if cat then rgb(cat.color) else Theme.accent
end

-- Draws everything into `c`; `big` adds names and clickable icons.
local function drawCity(c: Frame, big: boolean, marks: { [number]: Frame }, onPoi: ((any) -> ())?)
	c.BackgroundColor3 = Color3.fromRGB(118, 158, 100)
	local b = L.bounds
	-- hills in the north, beach and sea in the south
	rect(c, b.minX, b.minZ, b.maxX, CityLayout.ZS[1] - 40, Color3.fromRGB(98, 140, 86), 1)
	rect(c, b.minX, CityLayout.BEACH_Z, b.maxX, CityLayout.SEA_Z, Color3.fromRGB(236, 220, 170), 1)
	rect(c, b.minX, CityLayout.SEA_Z, b.maxX, b.maxZ, Color3.fromRGB(64, 140, 196), 1)
	for _, blk in L.blocks do
		local d = CityLayout.Districts[blk.district]
		local col = if d then rgb(d.color) else Color3.fromRGB(200, 200, 200)
		local f = rect(c, blk.x0, blk.z0, blk.x1, blk.z1, col:Lerp(Color3.new(1, 1, 1), 0.1), 2)
		if big then
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(0, 3)
			corner.Parent = f
		end
	end
	for _, r in L.roads do
		local hw = r.width / 2
		local x0, x1 = math.min(r.a.X, r.b.X) - hw, math.max(r.a.X, r.b.X) + hw
		local z0, z1 = math.min(r.a.Y, r.b.Y) - hw, math.max(r.a.Y, r.b.Y) + hw
		local col = if r.kind == "ring" then Color3.fromRGB(70, 72, 80) elseif r.kind == "main" then Color3.fromRGB(60, 62, 70) else Color3.fromRGB(84, 86, 94)
		rect(c, x0, z0, x1, z1, col, 3)
	end
	-- shop plots
	for _, p in L.plots do
		local center = plotCenter(p)
		local half = math.max(p.width, p.depth) / 2
		local m = rect(c, center.X - p.width / 2 + 2, center.Z - half + 2, center.X + p.width / 2 - 2, center.Z + half - 2, Color3.fromRGB(150, 150, 160), 4)
		m.BackgroundTransparency = 0.25
		m.Name = "Plot_" .. p.id
		local key = Instance.new("TextLabel")
		key.Name = "Key"
		key.BackgroundTransparency = 1
		key.Text = "🔑"
		key.TextScaled = true
		key.Size = UDim2.fromScale(0.7, 0.7)
		key.Position = UDim2.fromScale(0.15, 0.15)
		key.ZIndex = 5
		key.Visible = false
		key.Parent = m
		marks[p.id] = m
	end
	-- places
	for _, poi in L.pois do
		if poi.def and not poi.parent then
			local icon = Instance.new(if big then "TextButton" else "TextLabel") :: any
			icon.Name = "Poi_" .. poi.id
			if big then
				icon.AutoButtonColor = false
			end
			icon.Text = poi.def.icon or "📍"
			icon.TextScaled = true
			icon.BackgroundColor3 = poiColor(poi)
			icon.BackgroundTransparency = 0.1
			icon.AnchorPoint = Vector2.new(0.5, 0.5)
			icon.Position = UDim2.fromScale(sx(poi.pos.X), sz(poi.pos.Z))
			icon.Size = if big then UDim2.fromOffset(30, 30) else UDim2.fromOffset(18, 18)
			icon.ZIndex = 7
			icon.Parent = c
			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(1, 0)
			corner.Parent = icon
			if big then
				local stroke = Instance.new("UIStroke")
				stroke.Color = Color3.new(1, 1, 1)
				stroke.Thickness = 2
				stroke.ApplyStrokeMode = Enum.ApplyStrokeMode.Border
				stroke.Parent = icon
				local name = Kit.label(c, S.pick(poi.def.name), {
					AnchorPoint = Vector2.new(0.5, 0),
					Position = UDim2.new(sx(poi.pos.X), 0, sz(poi.pos.Z), 18),
					Size = UDim2.fromOffset(150, 18),
					TextSize = 13,
					FontFace = Theme.bold,
					TextXAlignment = Enum.TextXAlignment.Center,
					TextStrokeTransparency = 0.35,
					ZIndex = 8,
					Visible = false,
				})
				table.insert(nameLabels, name)
				if onPoi then
					(icon :: TextButton).Activated:Connect(function()
						onPoi(poi)
					end)
				end
			end
		end
	end
end

-- Colours plots: yours, other players', free (with a key).
local function paintPlots(marks: { [number]: Frame })
	local owned = {}
	for _, p in Players:GetPlayers() do
		local id = p:GetAttribute("Plot")
		if typeof(id) == "number" then
			owned[id] = p
		end
	end
	for id, m in marks do
		local who = owned[id]
		local key = m:FindFirstChild("Key") :: TextLabel?
		if who == player then
			m.BackgroundColor3 = Theme.accent2
			m.BackgroundTransparency = 0
		elseif who then
			m.BackgroundColor3 = Color3.fromRGB(110, 130, 200)
			m.BackgroundTransparency = 0.15
		else
			m.BackgroundColor3 = Color3.fromRGB(90, 190, 110)
			m.BackgroundTransparency = 0.2
		end
		if key then
			key.Visible = who == nil and m.AbsoluteSize.X > 10
		end
	end
end

----------------------------------------------------------------------------------------------------
-- Route drawing (both maps) and the trail on the ground
----------------------------------------------------------------------------------------------------
local function segment(parent: Instance, a: Vector3, b: Vector3, thickness: number, color: Color3)
	local mx, mz = (a.X + b.X) / 2, (a.Z + b.Z) / 2
	local f = Instance.new("Frame")
	f.BorderSizePixel = 0
	f.BackgroundColor3 = color
	f.AnchorPoint = Vector2.new(0.5, 0.5)
	f.Position = UDim2.fromScale(sx(mx), sz(mz))
	local dx, dz = b.X - a.X, b.Z - a.Z
	if math.abs(dz) < 0.5 then
		-- along a street: scale sizes stay exact at every zoom
		f.Size = UDim2.new(math.abs(dx) / W, thickness, 0, thickness)
	elseif math.abs(dx) < 0.5 then
		f.Size = UDim2.new(0, thickness, math.abs(dz) / H, thickness)
	else
		-- the short diagonal bits to and from the road (the canvas is scaled uniformly)
		local len = math.sqrt(dx * dx + dz * dz)
		f.Size = UDim2.new(len / W, 0, 0, thickness)
		f.Rotation = math.deg(math.atan2(dz, dx))
	end
	f.ZIndex = 6
	f.Parent = parent
end

local function drawRoute()
	for _, holder in routeFolders do
		Kit.clear(holder)
		for i = 2, #gps.points do
			segment(holder, gps.points[i - 1], gps.points[i], if holder:GetAttribute("Mini") then 4 else 5, Theme.accent)
		end
	end
end

local function v3(p: Vector2, y: number): Vector3
	return Vector3.new(p.X, y, p.Y)
end

local function pathLength(keys: { string }): number
	local len = 0
	for i = 2, #keys do
		local a, b = L.nodes[keys[i - 1]], L.nodes[keys[i]]
		len += math.abs(a.x - b.x) + math.abs(a.z - b.z)
	end
	return len
end

-- Road route from a position to a position: via the nearest road, the intersection graph and
-- the road next to the target.
local function routePoints(from: Vector3, to: Vector3): { Vector3 }
	local y = CityLayout.ROAD_Y + 0.2
	local road, q = CityLayout.nearestRoad(from)
	local roadT, qt = CityLayout.nearestRoad(to)
	if not road or not roadT or not q or not qt then
		return { from, to }
	end
	local start = v3(q, y)
	local finish = v3(qt, y)
	if road == roadT then
		return { from, start, finish, to }
	end
	local best, bestLen = nil, math.huge
	for _, s in { road.from, road.to } do
		for _, e in { roadT.from, roadT.to } do
			local keys = CityLayout.route(s, e)
			local sn, en = L.nodes[s], L.nodes[e]
			local len = math.abs(sn.x - q.X) + math.abs(sn.z - q.Y) + pathLength(keys) + math.abs(en.x - qt.X) + math.abs(en.z - qt.Y)
			if len < bestLen then
				best, bestLen = keys, len
			end
		end
	end
	local pts = { from, start }
	for _, k in best or {} do
		local n = L.nodes[k]
		table.insert(pts, Vector3.new(n.x, y, n.z))
	end
	table.insert(pts, finish)
	table.insert(pts, to)
	return pts
end

local function clearTrail()
	for _, a in arrows do
		a[1].Parent = nil
		a[2].Parent = nil
	end
	if beacon then
		beacon.Parent = nil
	end
end

local function trailBar(): BasePart
	local p = Instance.new("Part")
	p.Name = "GpsArrow"
	p.Anchored = true
	p.CanCollide = false
	p.CanQuery = false
	p.CanTouch = false
	p.CastShadow = false
	p.Material = Enum.Material.Neon
	p.Size = Vector3.new(0.35, 0.08, 1.56)
	return p
end

-- Glowing chevrons on the road for the next stretch of the route.
local CHEVRON = math.atan2(1, 1.2)
local function updateTrail()
	local pts = gps.points
	if #pts < 2 then
		clearTrail()
		return
	end
	local spacing, maxLen = 9, 260
	local used, carry, walked = 0, 0, 0
	for i = 2, #pts do
		local a, b = pts[i - 1], pts[i]
		local seg = Vector3.new(b.X - a.X, 0, b.Z - a.Z)
		local len = seg.Magnitude
		if len > 0.5 then
			local dir = seg / len
			local t = carry
			while t < len and walked + t < maxLen do
				used += 1
				local arrow = arrows[used]
				if not arrow then
					arrow = { trailBar(), trailBar() }
					arrows[used] = arrow
				end
				local pos = Vector3.new(a.X + dir.X * t, CityLayout.ROAD_Y + 0.12, a.Z + dir.Z * t)
				local cf = CFrame.lookAt(pos, pos + dir)
				-- "^" pointing along the route (forward is -Z)
				arrow[1].CFrame = cf * CFrame.new(-0.5, 0, -0.4) * CFrame.Angles(0, -CHEVRON, 0)
				arrow[2].CFrame = cf * CFrame.new(0.5, 0, -0.4) * CFrame.Angles(0, CHEVRON, 0)
				for _, bar in arrow do
					bar.Color = Theme.accent
					bar.Parent = trail
				end
				t += spacing
			end
			walked += len
			carry = math.max(0, t - len)
			if walked >= maxLen then
				break
			end
		end
	end
	for i = used + 1, #arrows do
		arrows[i][1].Parent = nil
		arrows[i][2].Parent = nil
	end
	-- a tall beam over the destination, visible from far away
	if gps.target then
		if not beacon then
			local p = Instance.new("Part")
			p.Name = "GpsBeacon"
			p.Shape = Enum.PartType.Cylinder
			p.Anchored = true
			p.CanCollide = false
			p.CanQuery = false
			p.CanTouch = false
			p.CastShadow = false
			p.Material = Enum.Material.Neon
			p.Transparency = 0.55
			p.Size = Vector3.new(160, 2.2, 2.2)
			beacon = p
		end
		local bp = beacon :: BasePart
		bp.Color = Theme.accent2
		bp.CFrame = CFrame.new(gps.target + Vector3.new(0, 80, 0)) * CFrame.Angles(0, 0, math.pi / 2)
		bp.Parent = trail
	end
end

function MapController.navigate(pos: Vector3, name: string)
	gps.target = pos
	gps.name = name
	gps.points = {}
	MapController.refreshRoute()
end

function MapController.clearRoute()
	gps.target = nil
	gps.points = {}
	drawRoute()
	clearTrail()
	if gpsLabel then
		gpsLabel.Parent.Visible = false
	end
end

function MapController.refreshRoute()
	local target = gps.target
	local pos = myPos()
	if not target or not pos then
		return
	end
	local dist = (Vector3.new(pos.X, 0, pos.Z) - Vector3.new(target.X, 0, target.Z)).Magnitude
	if dist < 30 then
		Hud.toast(S.t("gps_arrived", { name = gps.name }), "good")
		MapController.clearRoute()
		return
	end
	gps.points = routePoints(pos, target)
	drawRoute()
	updateTrail()
	if gpsLabel then
		gpsLabel.Parent.Visible = true
		-- 1 stud ≈ 0.28 m
		gpsLabel.Text = "📍 " .. S.t("gps_dist", { name = gps.name, d = math.floor(dist * 0.28 + 0.5) })
	end
end

----------------------------------------------------------------------------------------------------
-- The big map
----------------------------------------------------------------------------------------------------
local selectPoi

local function fareTo(pos: Vector3): number
	local me = myPos()
	local d = if me then (me - pos).Magnitude else 0
	return math.floor(Config.TaxiBaseFare + d * Config.TaxiPerStud)
end

local function showInfo(title: string, icon: string, desc: string, pos: Vector3?, poiId: string?, home: boolean?)
	Kit.clear(info)
	if not info:FindFirstChildOfClass("UIListLayout") then
		Kit.listLayout(info, 8)
	end
	Kit.label(info, icon .. " <b>" .. title .. "</b>", { TextSize = 20, LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	if #desc > 0 then
		Kit.label(info, desc, { TextColor3 = Theme.dim, TextSize = 14, LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	local me = myPos()
	if pos and me then
		Kit.label(info, "↔ " .. math.floor((me - pos).Magnitude * 0.28) .. " m", { LayoutOrder = 3, TextSize = 14 })
	end
	if pos then
		Kit.button(info, "🧭 " .. S.t("map_route"), function()
			MapController.navigate(pos, title)
			MapController.close()
		end, { Size = UDim2.new(1, 0, 0, 38), LayoutOrder = 4 }, "primary")
	end
	if home then
		Kit.button(info, "🏠 " .. S.t("home"), function()
			MapController.close()
			local r = Net.request("travel.home")
			if not r.ok then
				Hud.toast(S.err(r.err, { wait = r.wait }), "bad")
			end
		end, { Size = UDim2.new(1, 0, 0, 38), LayoutOrder = 5 }, "good")
	elseif poiId and pos then
		Kit.button(info, "🚕 " .. S.t("map_taxi", { price = S.money(fareTo(pos)) }), function()
			local r = Net.request("travel.taxi", poiId)
			if r.ok then
				MapController.close()
				Hud.toast(S.t("taxi_paid", { fare = S.money(r.fare or 0) }), "info")
			else
				App.report(r)
			end
		end, { Size = UDim2.new(1, 0, 0, 38), LayoutOrder = 5 }, "warn")
	end
	if gps.target then
		Kit.button(info, "✖ " .. S.t("map_clear"), function()
			MapController.clearRoute()
			selectPoi(nil)
		end, { Size = UDim2.new(1, 0, 0, 34), LayoutOrder = 6 }, "ghost")
	end
end

-- The side panel: the selected place, or a list of the places that matter for the game.
function selectPoi(poi)
	if poi then
		showInfo(S.pick(poi.def.name), poi.def.icon or "📍", S.pick(poi.def.desc), poi.door or poi.pos, poi.id)
		return
	end
	Kit.clear(info)
	local list = Kit.list(info, nil, 4)
	local n = 0
	local function entry(icon: string, text: string, fn: () -> ())
		n += 1
		local b = Kit.button(list, icon .. "  " .. text, fn, { Size = UDim2.new(1, 0, 0, 34), LayoutOrder = n, TextSize = 14, TextXAlignment = Enum.TextXAlignment.Left })
		local pad = Instance.new("UIPadding")
		pad.PaddingLeft = UDim.new(0, 8)
		pad.Parent = b
	end
	local plotId = player:GetAttribute("Plot")
	local myPlot = typeof(plotId) == "number" and L.plots[plotId]
	if myPlot then
		entry("🏪", S.t("map_shop"), function()
			showInfo(S.t("map_shop"), "🏪", "", plotCenter(myPlot), nil, true)
		end)
	end
	for _, poi in L.pois do
		if poi.def and poi.def.service then
			entry(poi.def.icon or "📍", S.pick(poi.def.name), function()
				selectPoi(poi)
			end)
		end
	end
	if gps.target then
		entry("✖", S.t("map_clear"), function()
			MapController.clearRoute()
			selectPoi(nil)
		end)
	end
end

local function canvasSize(): Vector2
	return Vector2.new(W * baseScale * zoom, H * baseScale * zoom)
end

-- The view's size in GUI units (canvas offsets are in GUI units, not screen pixels).
local function viewSize(): Vector2
	return viewport.AbsoluteSize / uiScale()
end

-- anchor: a point in the view, in GUI units
local function setZoom(z: number, anchor: Vector2?)
	local vp = viewSize()
	local pivot = anchor or vp / 2
	local old = canvasSize()
	local pos = Vector2.new(canvas.Position.X.Offset, canvas.Position.Y.Offset)
	-- world point under the pivot stays put
	local fx, fy = (pivot.X - pos.X) / old.X, (pivot.Y - pos.Y) / old.Y
	zoom = math.clamp(z, 1, 7)
	local new = canvasSize()
	canvas.Size = UDim2.fromOffset(new.X, new.Y)
	canvas.Position = UDim2.fromOffset(pivot.X - fx * new.X, pivot.Y - fy * new.Y)
	for _, l in nameLabels do
		l.Visible = zoom >= 2.2
	end
	paintPlots(plotMarks)
end

local function centerOn(pos: Vector3)
	local vp = viewSize()
	local size = canvasSize()
	canvas.Position = UDim2.fromOffset(vp.X / 2 - sx(pos.X) * size.X, vp.Y / 2 - sz(pos.Z) * size.Y)
end

local function buildBig()
	local root = Kit.panel(App.screen, { Name = "Map", Size = UDim2.new(1, -40, 1, -40), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = Theme.panel, Visible = false, ZIndex = 20 })
	mapRoot = root
	Kit.label(root, "🗺️ " .. S.t("map_title"), { Size = UDim2.new(1, -80, 0, 40), Position = UDim2.fromOffset(16, 4), FontFace = Theme.heavy, TextSize = 22 })
	Kit.button(root, "✕", function()
		MapController.close()
	end, { Size = UDim2.fromOffset(36, 36), Position = UDim2.new(1, -46, 0, 6) })
	Kit.label(root, S.t("map_hint"), { Size = UDim2.new(1, -330, 0, 20), Position = UDim2.new(0, 16, 1, -26), TextColor3 = Theme.dim, TextSize = 13 })
	viewport = Kit.frame(root, { Name = "View", Size = UDim2.new(1, -330, 1, -80), Position = UDim2.fromOffset(12, 48), BackgroundColor3 = Color3.fromRGB(64, 140, 196), ClipsDescendants = true })
	Kit.corner(viewport, UDim.new(0, 10))
	canvas = Kit.frame(viewport, { Name = "Canvas", BackgroundColor3 = Color3.fromRGB(118, 158, 100) })
	drawCity(canvas, true, plotMarks, function(poi)
		selectPoi(poi)
	end)
	local route = Kit.frame(canvas, { Name = "Route", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 6 })
	table.insert(routeFolders, route)
	othersHolder = Kit.frame(canvas, { Name = "Others", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 9 })
	arrow = Kit.label(canvas, "▲", { Name = "Me", AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(26, 26), TextSize = 24, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.new(1, 1, 1), TextStrokeTransparency = 0, TextStrokeColor3 = Theme.bad, ZIndex = 12 })

	-- side panel and legend
	local side = Kit.panel(root, { Size = UDim2.new(0, 300, 1, -80), Position = UDim2.new(1, -312, 0, 48), BackgroundColor3 = Theme.card })
	Kit.padding(side, 10)
	info = Kit.frame(side, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -150) })
	local legend = Kit.frame(side, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 140), Position = UDim2.new(0, 0, 1, -140) })
	local grid = Instance.new("UIGridLayout")
	grid.CellSize = UDim2.new(0.5, -4, 0, 18)
	grid.CellPadding = UDim2.fromOffset(4, 2)
	grid.Parent = legend
	local legendItems = {
		{ Theme.accent2, S.t("map_shop") },
		{ Color3.fromRGB(90, 190, 110), S.t("map_free_plot") },
	}
	for _, cat in { "shop", "market", "vehicle", "business", "food", "leisure", "civic", "landmark" } do
		local c = Locations.categories[cat]
		table.insert(legendItems, { rgb(c.color), S.pick(c.name) })
	end
	for _, it in legendItems do
		local row = Kit.frame(legend, { BackgroundTransparency = 1 })
		local dot = Kit.frame(row, { Size = UDim2.fromOffset(12, 12), Position = UDim2.fromOffset(0, 3), BackgroundColor3 = it[1] })
		Kit.corner(dot, UDim.new(1, 0))
		Kit.label(row, it[2], { Size = UDim2.new(1, -16, 1, 0), Position = UDim2.fromOffset(16, 0), TextSize = 12, TextColor3 = Theme.dim, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	end

	-- pan and zoom
	local dragging, last = false, Vector2.zero
	local function inside(p: Vector2): boolean
		local a, s = viewport.AbsolutePosition, viewport.AbsoluteSize
		return p.X >= a.X and p.Y >= a.Y and p.X <= a.X + s.X and p.Y <= a.Y + s.Y
	end
	UserInputService.InputBegan:Connect(function(input)
		if not root.Visible then
			return
		end
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			local p = screenPoint(input)
			if inside(p) then
				dragging, last = true, p
			end
		end
	end)
	UserInputService.InputChanged:Connect(function(input)
		if not root.Visible then
			return
		end
		local t = input.UserInputType
		if dragging and (t == Enum.UserInputType.MouseMovement or t == Enum.UserInputType.Touch) then
			local p = screenPoint(input)
			local d = (p - last) / uiScale()
			last = p
			canvas.Position = UDim2.fromOffset(canvas.Position.X.Offset + d.X, canvas.Position.Y.Offset + d.Y)
		elseif t == Enum.UserInputType.MouseWheel then
			local p = screenPoint(input)
			if inside(p) then
				setZoom(zoom * (if input.Position.Z > 0 then 1.2 else 1 / 1.2), (p - viewport.AbsolutePosition) / uiScale())
			end
		end
	end)
	UserInputService.InputEnded:Connect(function(input)
		local t = input.UserInputType
		if t == Enum.UserInputType.MouseButton1 or t == Enum.UserInputType.Touch then
			dragging = false
		end
	end)
	UserInputService.TouchPinch:Connect(function(_, scale, _, state)
		if root.Visible and state == Enum.UserInputState.Change then
			setZoom(zoom * scale)
		end
	end)
end

local function updateBig()
	if not mapRoot or not mapRoot.Visible then
		return
	end
	local pos = myPos()
	if pos then
		arrow.Position = UDim2.fromScale(sx(pos.X), sz(pos.Z))
		arrow.Rotation = heading()
	end
	-- other players
	Kit.clear(othersHolder)
	for _, p in Players:GetPlayers() do
		if p ~= player then
			local char = p.Character
			local root = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
			if root then
				local dot = Kit.frame(othersHolder, { AnchorPoint = Vector2.new(0.5, 0.5), Size = UDim2.fromOffset(10, 10), Position = UDim2.fromScale(sx(root.Position.X), sz(root.Position.Z)), BackgroundColor3 = Color3.fromRGB(110, 150, 255), ZIndex = 10 })
				Kit.corner(dot, UDim.new(1, 0))
			end
		end
	end
end

function MapController.open()
	if not mapRoot then
		buildBig()
	end
	Kit.closeWindow()
	local root = mapRoot :: Frame
	root.Visible = true
	-- the whole city fits the view at zoom 1
	local vp = viewSize()
	baseScale = math.min(vp.X / W, vp.Y / H)
	setZoom(2.2)
	local pos = myPos()
	if pos then
		centerOn(pos)
	end
	selectPoi(nil)
	updateBig()
end

function MapController.close()
	if mapRoot then
		mapRoot.Visible = false
	end
end

function MapController.toggle()
	if mapRoot and mapRoot.Visible then
		MapController.close()
	else
		MapController.open()
	end
end

-- After a language change: the big map is drawn again on its next opening.
function MapController.relabel()
	if mapRoot then
		mapRoot:Destroy()
		mapRoot = nil
		table.clear(nameLabels)
		table.clear(plotMarks)
		for i = #routeFolders, 1, -1 do
			if not routeFolders[i]:GetAttribute("Mini") then
				table.remove(routeFolders, i)
			end
		end
	end
end

function MapController.isOpen(): boolean
	return mapRoot ~= nil and mapRoot.Visible
end

----------------------------------------------------------------------------------------------------
-- Minimap
----------------------------------------------------------------------------------------------------
local function buildMini()
	-- bottom-left with a mouse; on phones the thumbstick lives there, so top-right instead
	local touch = UserInputService.TouchEnabled and not UserInputService.KeyboardEnabled
	local miniPos = if touch then UDim2.new(1, -16, 0, 60) else UDim2.new(0, 16, 1, -16)
	local miniAnchor = if touch then Vector2.new(1, 0) else Vector2.new(0, 1)
	mini = Kit.panel(App.screen, { Name = "Minimap", Size = UDim2.fromOffset(MINI_SIZE, MINI_SIZE), Position = miniPos, AnchorPoint = miniAnchor, BackgroundColor3 = Color3.fromRGB(64, 140, 196), ClipsDescendants = true })
	Hud.register(mini)
	Kit.outline(mini, Color3.new(1, 1, 1), 3, 0.2)
	miniCanvas = Kit.frame(mini, { Name = "Canvas", Size = UDim2.fromOffset(W * MINI_SCALE, H * MINI_SCALE) })
	drawCity(miniCanvas, false, miniPlotMarks, nil)
	local route = Kit.frame(miniCanvas, { Name = "Route", BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1), ZIndex = 6 })
	route:SetAttribute("Mini", true)
	table.insert(routeFolders, route)
	miniArrow = Kit.label(mini, "▲", { AnchorPoint = Vector2.new(0.5, 0.5), Position = UDim2.fromScale(0.5, 0.5), Size = UDim2.fromOffset(22, 22), TextSize = 20, TextXAlignment = Enum.TextXAlignment.Center, TextColor3 = Color3.new(1, 1, 1), TextStrokeTransparency = 0, TextStrokeColor3 = Theme.bad, ZIndex = 12 })
	Kit.label(mini, "N", { Size = UDim2.fromOffset(20, 20), Position = UDim2.new(0.5, -10, 0, 2), TextXAlignment = Enum.TextXAlignment.Center, FontFace = Theme.heavy, TextStrokeTransparency = 0.3, ZIndex = 12 })
	local open = Instance.new("TextButton")
	open.BackgroundTransparency = 1
	open.Text = ""
	open.Size = UDim2.fromScale(1, 1)
	open.ZIndex = 13
	open.Parent = mini
	open.Activated:Connect(MapController.open)
	-- GPS: where you're heading and how far, above the minimap
	local gpsPos = if touch then UDim2.new(1, -16, 0, 60 + MINI_SIZE + 8) else UDim2.new(0, 16, 1, -24 - MINI_SIZE)
	local g = Kit.panel(App.screen, { Name = "Gps", Size = UDim2.fromOffset(300, 34), Position = gpsPos, AnchorPoint = miniAnchor, BackgroundTransparency = 0.1, Visible = false })
	Hud.register(g)
	gpsLabel = Kit.label(g, "", { Size = UDim2.new(1, -44, 1, 0), Position = UDim2.fromOffset(10, 0), TextSize = 15, FontFace = Theme.bold, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	Kit.button(g, "✖", function()
		MapController.clearRoute()
	end, { Size = UDim2.fromOffset(28, 28), Position = UDim2.new(1, -31, 0, 3), TextSize = 14 })
end

local function updateMini()
	local pos = myPos()
	if not pos or not mini then
		return
	end
	miniCanvas.Position = UDim2.fromOffset(MINI_SIZE / 2 - sx(pos.X) * W * MINI_SCALE, MINI_SIZE / 2 - sz(pos.Z) * H * MINI_SCALE)
	miniArrow.Rotation = heading()
end

function MapController.setMinimapVisible(on: boolean)
	if mini then
		mini.Visible = on
	end
end

----------------------------------------------------------------------------------------------------
function MapController.init()
	L = CityLayout.get()
	minX, minZ = L.bounds.minX, L.bounds.minZ
	W, H = L.bounds.maxX - L.bounds.minX, L.bounds.maxZ - L.bounds.minZ
	trail = Instance.new("Folder")
	trail.Name = "GpsTrail"
	trail.Parent = Workspace
	buildMini()
	paintPlots(miniPlotMarks)
	UserInputService.InputBegan:Connect(function(input, processed)
		if processed then
			return
		end
		if input.KeyCode == Enum.KeyCode.M then
			MapController.toggle()
		elseif input.KeyCode == Enum.KeyCode.Escape and MapController.isOpen() then
			MapController.close()
		end
	end)
	local acc, routeAcc = 0, 0
	RunService.RenderStepped:Connect(function(dt)
		updateMini()
		acc += dt
		routeAcc += dt
		if acc > 0.25 then
			acc = 0
			updateBig()
		end
		if routeAcc > 0.6 then
			routeAcc = 0
			if gps.target then
				MapController.refreshRoute()
			end
		end
	end)
	-- plot ownership changes when players come, go or move
	local function watch(p: Player)
		p:GetAttributeChangedSignal("Plot"):Connect(function()
			paintPlots(miniPlotMarks)
			if mapRoot then
				paintPlots(plotMarks)
			end
		end)
	end
	for _, p in Players:GetPlayers() do
		watch(p)
	end
	Players.PlayerAdded:Connect(watch)
	Players.PlayerRemoving:Connect(function()
		task.defer(function()
			paintPlots(miniPlotMarks)
			if mapRoot then
				paintPlots(plotMarks)
			end
		end)
	end)
end

return MapController
