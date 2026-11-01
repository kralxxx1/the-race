-- PlaceLabels: names the destinations in the world. Every place of the map gets a label floating over
-- it (its icon and its name, in the colour of its kind: the same colours as the map's legend), drawn
-- over whatever stands in between, so a place can be found from across the city and the places stand
-- apart from one another. Only the nearest few are shown at once; a label fades in once you are away
-- from the place's doorstep (where its own sign and its prompt do the talking) and fades out far
-- away, so the street never fills up with text. Switched off with the name tags in Settings.

local Players = game:GetService("Players")
local RunService = game:GetService("RunService")
local Workspace = game:GetService("Workspace")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)
local Locations = require(Shared.Data.Locations)

local Client = script.Parent.Parent
local Prefs = require(Client.Prefs)
local Theme = require(Client.UI.Theme)
local S = require(Client.Strings)

local PlaceLabels = {}

PlaceLabels.NEAR = 60 -- closer than this the place speaks for itself
PlaceLabels.FULL = 110 -- fully there from here on
PlaceLabels.FADE = 380 -- and fading out from here
PlaceLabels.FAR = 560 -- gone
PlaceLabels.MAX = 12 -- labels on screen at once

local player = Players.LocalPlayer

type Entry = {
	poi: any,
	def: any,
	anchor: Part,
	gui: BillboardGui,
	label: TextLabel,
	color: Color3,
	groundY: number?,
	groundAt: number,
	dist: number,
}

local entries: { Entry } = {}
local folder: Folder? = nil

-- How much of the label shows at distance d (0..1).
function PlaceLabels.alphaAt(d: number): number
	local rise = math.clamp((d - PlaceLabels.NEAR) / (PlaceLabels.FULL - PlaceLabels.NEAR), 0, 1)
	local fall = math.clamp((PlaceLabels.FAR - d) / (PlaceLabels.FAR - PlaceLabels.FADE), 0, 1)
	return rise * fall
end

local function textOf(def): string
	return (def.icon or "📍") .. " " .. S.pick(def.name)
end

local function build(poi, def): Entry
	local color = Color3.fromRGB(240, 240, 240)
	local cat = Locations.categories[def.cat]
	if cat then
		color = Color3.fromRGB(cat.color[1], cat.color[2], cat.color[3])
	end
	local anchor = Instance.new("Part")
	anchor.Name = "Place_" .. poi.id
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.CastShadow = false
	anchor.Transparency = 1
	anchor.Size = Vector3.new(1, 1, 1)
	anchor.Position = Vector3.new(poi.pos.X, CityLayout.WALK_Y + 26, poi.pos.Z)
	local gui = Instance.new("BillboardGui")
	gui.Name = "PlaceLabel"
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.MaxDistance = PlaceLabels.FAR + 40
	gui.Size = UDim2.fromOffset(190, 34)
	gui.StudsOffset = Vector3.new(0, if poi.site then 14 else 4, 0)
	gui.Enabled = false
	gui.Adornee = anchor
	gui.Parent = anchor
	local label = Instance.new("TextLabel")
	label.Name = "Text"
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundColor3 = color:Lerp(Color3.new(0, 0, 0), 0.5)
	label.BackgroundTransparency = 0.2
	label.BorderSizePixel = 0
	label.TextColor3 = Color3.new(1, 1, 1)
	label.TextStrokeColor3 = Color3.new(0, 0, 0)
	label.TextStrokeTransparency = 0.5
	label.TextScaled = true
	label.TextXAlignment = Enum.TextXAlignment.Center
	pcall(function()
		label.FontFace = Theme.bold
	end)
	label.Text = textOf(def)
	label.Parent = gui
	local corner = Instance.new("UICorner")
	corner.CornerRadius = UDim.new(0, 9)
	corner.Parent = label
	local stroke = Instance.new("UIStroke")
	stroke.Color = color
	stroke.Thickness = 2
	stroke.Parent = label
	local pad = Instance.new("UIPadding")
	pad.PaddingLeft = UDim.new(0, 8)
	pad.PaddingRight = UDim.new(0, 8)
	pad.PaddingTop = UDim.new(0, 4)
	pad.PaddingBottom = UDim.new(0, 4)
	pad.Parent = label
	return { poi = poi, def = def, anchor = anchor, gui = gui, label = label, color = color, groundY = nil, groundAt = -math.huge, dist = math.huge }
end

-- Where the ground is under the place (the hills are higher than the city): asked of the world once
-- the terrain has streamed in, and again every few seconds until it answers.
local function settle(e: Entry, now: number)
	if e.groundY or now - e.groundAt < 4 then
		return
	end
	e.groundAt = now
	local params = RaycastParams.new()
	params.FilterType = Enum.RaycastFilterType.Exclude
	local skip: { Instance } = {}
	if folder then
		table.insert(skip, folder)
	end
	if player and player.Character then
		table.insert(skip, player.Character)
	end
	params.FilterDescendantsInstances = skip
	local ok, hit = pcall(function()
		return Workspace:Raycast(Vector3.new(e.poi.pos.X, 900, e.poi.pos.Z), Vector3.new(0, -1800, 0), params)
	end)
	if ok and hit then
		e.groundY = math.max(hit.Position.Y, CityLayout.WALK_Y)
		e.anchor.Position = Vector3.new(e.poi.pos.X, e.groundY + 26, e.poi.pos.Z)
	end
end

-- One look at the world from `camPos`: shows the nearest labels, faded by distance. Returns how many are shown.
function PlaceLabels.step(camPos: Vector3, now: number?): number
	local on = Prefs.get("names") ~= false
	local t = now or os.clock()
	for _, e in entries do
		local p = e.anchor.Position
		e.dist = (Vector3.new(p.X, camPos.Y, p.Z) - camPos).Magnitude
	end
	local order = table.clone(entries)
	table.sort(order, function(a, b)
		return a.dist < b.dist
	end)
	local shown = 0
	for _, e in order do
		local a = if on and shown < PlaceLabels.MAX then PlaceLabels.alphaAt(e.dist) else 0
		if a > 0.02 then
			settle(e, t)
			shown += 1
			e.gui.Enabled = true
			e.label.TextTransparency = 1 - a
			e.label.TextStrokeTransparency = 1 - a * 0.5
			e.label.BackgroundTransparency = 1 - a * 0.8
			local stroke = e.label:FindFirstChildOfClass("UIStroke")
			if stroke then
				stroke.Transparency = 1 - a
			end
		else
			e.gui.Enabled = false
		end
	end
	return shown
end

-- The language changed: the names are written again.
function PlaceLabels.relabel()
	for _, e in entries do
		e.label.Text = textOf(e.def)
	end
end

-- How many places have a label (for the tests).
function PlaceLabels.count(): number
	return #entries
end

function PlaceLabels.init()
	local L = CityLayout.get()
	folder = Instance.new("Folder")
	folder.Name = "PlaceLabels"
	for _, poi in L.pois do
		local def = poi.def or Locations.get(poi.id)
		if def and poi.pos then
			local e = build(poi, def)
			e.anchor.Parent = folder
			table.insert(entries, e)
		end
	end
	folder.Parent = Workspace
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 0.25 then
			return
		end
		acc = 0
		local cam = Workspace.CurrentCamera
		if cam then
			PlaceLabels.step(cam.CFrame.Position)
		end
	end)
end

return PlaceLabels
