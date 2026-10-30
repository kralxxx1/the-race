-- Roads: asphalt, sidewalks, curbs, lane markings, crosswalks, intersections, traffic lights,
-- street lamps, street trees, benches, name signs, bus stops and the seaside promenade.

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local Rand = require(Shared.Util.Rand)
local Props = require(Shared.Models.Props)
local CityLayout = require(Shared.World.CityLayout)

local Roads = {}
local M = Enum.Material
local P = B.Palette
local ROAD_Y = CityLayout.ROAD_Y
local WALK_Y = CityLayout.WALK_Y

local URBAN = { DWN = true, TEC = true, TEP = true, OLD = true, PLZ = true, SEA = true, CST = true }

local function sidewalkWidth(kind: string): number
	if kind == "main" then
		return 10
	elseif kind == "ring" then
		return 6
	end
	return 9
end
Roads.sidewalkWidth = sidewalkWidth

local function flat(parent, center: Vector3, dir: Vector3, size: Vector3, color, material, props)
	local cf = CFrame.lookAt(center, center + dir)
	return B.box(parent, cf, size, color, material, props)
end

local function sidewalkMaterial(district: string)
	if district == "OLD" then
		return M.SmoothPlastic, Color3.fromRGB(170, 160, 146)
	elseif district == "SEA" or district == "CST" then
		return M.SmoothPlastic, Color3.fromRGB(214, 206, 190)
	elseif district == "IND" or district == "HAR" or district == "SCR" or district == "DAT" then
		return M.SmoothPlastic, Color3.fromRGB(160, 160, 158)
	end
	return M.SmoothPlastic, P.sidewalk
end

-- sidewalk colour as laid: slightly darker than the swatch (flat light colours glare in the sun)
local function laid(color: Color3): Color3
	return color:Lerp(Color3.new(0, 0, 0), 0.2)
end

-- Entrances along the streets (landmark doors and shop plot fronts): lamps, trees and benches keep
-- out of their way.
local doorCache
local function doors(L): { Vector3 }
	if not doorCache then
		doorCache = {}
		for _, poi in L.pois do
			if poi.door then
				table.insert(doorCache, poi.door)
			end
		end
		for _, plot in L.plots do
			table.insert(doorCache, plot.cf.Position)
		end
	end
	return doorCache
end
local function nearDoor(L, p: Vector3, radius: number): boolean
	for _, d in doors(L) do
		local dx, dz = d.X - p.X, d.Z - p.Z
		if dx * dx + dz * dz < radius * radius then
			return true
		end
	end
	return false
end

-- Draws one road segment between intersections.
local function segment(folder: Instance, L, road, rng: Random)
	local a = Vector3.new(road.a.X, 0, road.a.Y)
	local b = Vector3.new(road.b.X, 0, road.b.Y)
	local dir = (b - a).Unit
	local right = Vector3.new(-dir.Z, 0, dir.X)
	local nodeA, nodeB = L.nodes[road.from], L.nodes[road.to]
	local insetA = if road.vertical then CityLayout.roadWidthH(nodeA.j) / 2 else CityLayout.roadWidthV(nodeA.i) / 2
	local insetB = if road.vertical then CityLayout.roadWidthH(nodeB.j) / 2 else CityLayout.roadWidthV(nodeB.i) / 2
	local p0 = a + dir * insetA
	local p1 = b - dir * insetB
	local len = (p1 - p0).Magnitude
	if len < 1 then
		return
	end
	local mid = (p0 + p1) / 2
	local sw = sidewalkWidth(road.kind)
	local cw = road.width - sw * 2
	local m = B.model("Road_" .. road.id, folder)

	-- carriageway
	flat(m, mid + Vector3.new(0, ROAD_Y - 0.25, 0), dir, Vector3.new(cw, 0.5, len), P.asphalt, M.Asphalt)
	-- sidewalks and curbs (district aware on each side)
	for side = -1, 1, 2 do
		local off = right * side * (cw / 2 + sw / 2)
		local probe = mid + right * side * (road.width / 2 + 20)
		local mat, col = sidewalkMaterial(CityLayout.districtAt(probe))
	col = laid(col)
		flat(m, mid + off + Vector3.new(0, WALK_Y / 2, 0), dir, Vector3.new(sw, WALK_Y, len), col, mat)
		flat(m, mid + right * side * (cw / 2 + 0.25) + Vector3.new(0, WALK_Y / 2 + 0.03, 0), dir, Vector3.new(0.5, WALK_Y + 0.06, len), P.curb, M.SmoothPlastic)
	end

	-- markings
	local markY = ROAD_Y + 0.02
	local function line(offset: number, width: number, color, dashed: boolean)
		if not dashed then
			flat(m, mid + right * offset + Vector3.new(0, markY, 0), dir, Vector3.new(width, 0.04, len - 6), color, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CastShadow = false })
			return
		end
		local dash, gap = 6, 9
		local n = math.floor((len - 10) / (dash + gap))
		for k = 0, n - 1 do
			local t = -len / 2 + 5 + dash / 2 + k * (dash + gap)
			flat(m, mid + dir * t + right * offset + Vector3.new(0, markY, 0), dir, Vector3.new(width, 0.04, dash), color, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CastShadow = false })
		end
	end
	if road.kind == "street" then
		line(0, 0.45, P.lineWhite, true)
	else
		line(-0.45, 0.35, P.lineYellow, false)
		line(0.45, 0.35, P.lineYellow, false)
		line(-cw / 4, 0.35, P.lineWhite, true)
		line(cw / 4, 0.35, P.lineWhite, true)
	end

	-- urban furniture
	local districtL = CityLayout.districtAt(mid - right * (road.width / 2 + 20))
	local districtR = CityLayout.districtAt(mid + right * (road.width / 2 + 20))
	local urban = URBAN[districtL] or URBAN[districtR]
	local spacing = if urban then 62 else 84
	local count = math.floor(len / spacing)
	local classic = districtL == "OLD" or districtR == "OLD" or districtL == "PLZ" or districtR == "PLZ"
	for k = 0, count - 1 do
		local t = -len / 2 + spacing * (k + 0.5)
		local side = if k % 2 == 0 then 1 else -1
		if road.kind == "ring" then
			side = 1
		end
		local base = mid + dir * t + right * side * (cw / 2 + 1.6)
		-- step aside from an entrance (the middle of a block is where doors are)
		for _ = 1, 3 do
			if not nearDoor(L, base + right * side * sw, 13) then
				break
			end
			t += 14
			base = mid + dir * t + right * side * (cw / 2 + 1.6)
		end
		local face = -right * side
		Props.streetLamp(m, CFrame.lookAt(base + Vector3.new(0, WALK_Y, 0), base + Vector3.new(0, WALK_Y, 0) + face), if classic then "classic" else "modern")
		if urban and road.kind ~= "ring" then
			-- trees in pits between lamps, on both sides
			for s = -1, 1, 2 do
				local tp = mid + dir * (t + spacing / 2) + right * s * (cw / 2 + sw / 2)
				if math.abs(t + spacing / 2) < len / 2 - 8 and not nearDoor(L, tp + right * s * (sw / 2), 9) then
					B.box(m, CFrame.new(tp + Vector3.new(0, WALK_Y + 0.02, 0)), Vector3.new(4, 0.08, 4), P.soil, M.Ground, { CanCollide = false })
					Props.tree(m, CFrame.new(tp + Vector3.new(0, WALK_Y, 0)), Rand.pick(rng, if districtL == "SEA" or districtL == "CST" then { "palm", "palm", "street" } else { "street", "street", "street", "cypress" }), rng)
				end
			end
			if rng:NextNumber() < 0.3 then
				local bp = mid + dir * (t + 12) + right * side * (cw / 2 + sw - 2)
				Props.bench(m, CFrame.lookAt(bp + Vector3.new(0, WALK_Y, 0), bp + Vector3.new(0, WALK_Y, 0) - right * side))
				Props.bin(m, CFrame.new(bp + dir * 4.5 + Vector3.new(0, WALK_Y, 0)))
			end
		elseif rng:NextNumber() < 0.25 and road.kind ~= "ring" then
			Props.tree(m, CFrame.new(mid + dir * (t + spacing / 2) + right * side * (cw / 2 + sw / 2) + Vector3.new(0, WALK_Y, 0)), "street", rng)
		end
	end
	if urban and rng:NextNumber() < 0.25 then
		local hp = mid + dir * (len * 0.3) + right * (cw / 2 + 1.2)
		Props.hydrant(m, CFrame.new(hp + Vector3.new(0, WALK_Y, 0)))
	end
	-- bus stops on the main roads
	if road.kind == "main" and road.id % 2 == 0 then
		local side = if road.id % 4 == 0 then 1 else -1
		local bp = mid + right * side * (cw / 2 + sw / 2 + 1)
		Props.busStop(m, CFrame.lookAt(bp + Vector3.new(0, WALK_Y, 0), bp + Vector3.new(0, WALK_Y, 0) - right * side), road.name)
	end
	return m
end

-- Intersection: asphalt bands, sidewalk corners, crosswalks, traffic lights and a name sign.
local function intersection(folder: Instance, L, node, rng: Random)
	local X, Z = node.x, node.z
	local Wv = CityLayout.roadWidthV(node.i)
	local Wh = CityLayout.roadWidthH(node.j)
	local kindV = if Wv == 52 then "ring" elseif Wv == 60 then "main" else "street"
	local kindH = if Wh == 52 then "ring" elseif Wh == 60 then "main" else "street"
	local cwV = Wv - 2 * sidewalkWidth(kindV)
	local cwH = Wh - 2 * sidewalkWidth(kindH)
	local has = { N = false, S = false, E = false, W = false }
	for _, link in node.links do
		local o = L.nodes[link.node]
		if o.x == X then
			if o.z < Z then
				has.N = true
			else
				has.S = true
			end
		else
			if o.x < X then
				has.W = true
			else
				has.E = true
			end
		end
	end
	local m = B.model("Junction_" .. node.key, folder)
	local function pad(cx, cz, sx, sz, col, mat, y, h)
		B.box(m, CFrame.new(cx, y, cz), Vector3.new(sx, h, sz), col, mat)
	end
	local mat, col = sidewalkMaterial(CityLayout.districtAt(Vector3.new(X + Wv, 0, Z + Wh)))
	col = laid(col)
	if has.N or has.S then
		pad(X, Z, cwV, Wh, P.asphalt, M.Asphalt, ROAD_Y - 0.25, 0.5)
	end
	if has.E or has.W then
		pad(X, Z, Wv, cwH, P.asphalt, M.Asphalt, ROAD_Y - 0.25, 0.5)
	end
	-- corners
	local cx = (Wv - cwV) / 2
	local cz = (Wh - cwH) / 2
	for sx = -1, 1, 2 do
		for sz = -1, 1, 2 do
			pad(X + sx * (cwV / 2 + cx / 2), Z + sz * (cwH / 2 + cz / 2), cx, cz, col, mat, WALK_Y / 2, WALK_Y)
		end
	end
	-- missing directions become sidewalk
	if not has.N then
		pad(X, Z - (cwH / 2 + cz / 2), cwV, cz, col, mat, WALK_Y / 2, WALK_Y)
	end
	if not has.S then
		pad(X, Z + (cwH / 2 + cz / 2), cwV, cz, col, mat, WALK_Y / 2, WALK_Y)
	end
	if not has.W then
		pad(X - (cwV / 2 + cx / 2), Z, cx, cwH, col, mat, WALK_Y / 2, WALK_Y)
	end
	if not has.E then
		pad(X + (cwV / 2 + cx / 2), Z, cx, cwH, col, mat, WALK_Y / 2, WALK_Y)
	end

	local four = has.N and has.S and has.E and has.W
	local district = CityLayout.districtAt(Vector3.new(X + Wv, 0, Z + Wh))
	local busy = URBAN[district] or kindV == "main" or kindH == "main"
	-- crosswalks on busy four-way junctions
	if four and busy then
		local stripe = Color3.fromRGB(236, 236, 230)
		local function zebra(center: Vector3, along: Vector3, across: number)
			local n = math.floor(across / 2.6)
			local perp = Vector3.new(-along.Z, 0, along.X)
			for k = 0, n - 1 do
				local off = -across / 2 + 1.3 + k * 2.6
				B.box(m, CFrame.lookAt(center + perp * off, center + perp * off + along), Vector3.new(1.3, 0.04, 5), stripe, M.SmoothPlastic, { CanCollide = false, CanTouch = false, CastShadow = false })
			end
		end
		local y = ROAD_Y + 0.02
		zebra(Vector3.new(X, y, Z - cwH / 2 - 3.5), Vector3.new(0, 0, 1), cwV)
		zebra(Vector3.new(X, y, Z + cwH / 2 + 3.5), Vector3.new(0, 0, 1), cwV)
		zebra(Vector3.new(X - cwV / 2 - 3.5, y, Z), Vector3.new(1, 0, 0), cwH)
		zebra(Vector3.new(X + cwV / 2 + 3.5, y, Z), Vector3.new(1, 0, 0), cwH)
	end
	-- traffic lights: right-hand traffic, signal on the near-right corner of each approach
	if four and kindV ~= "ring" and kindH ~= "ring" then
		local ox, oz = cwV / 2 + 1.5, cwH / 2 + 1.5
		local function signal(px, pz, faceX, faceZ, axis)
			local p = Vector3.new(px, WALK_Y, pz)
			Props.trafficLight(m, CFrame.lookAt(p, p + Vector3.new(faceX, 0, faceZ)), axis, node.key)
		end
		signal(X + ox, Z + oz, 0, 1, "NS") -- northbound traffic arrives from the south
		signal(X - ox, Z - oz, 0, -1, "NS") -- southbound from the north
		signal(X - ox, Z + oz, -1, 0, "EW") -- eastbound arrives from the west
		signal(X + ox, Z - oz, 1, 0, "EW") -- westbound from the east
	end
	-- street name sign on one corner
	if node.links[1] and rng:NextNumber() < 0.7 then
		local vName, hName = "", ""
		for _, link in node.links do
			local r = L.roads[link.road]
			if r.vertical then
				vName = r.name
			else
				hName = r.name
			end
		end
		local text = if vName ~= "" and hName ~= "" then vName .. "  ✕  " .. hName else vName .. hName
		local p = Vector3.new(X - cwV / 2 - cx * 0.6, WALK_Y, Z - cwH / 2 - cz * 0.6)
		Props.streetSign(m, CFrame.lookAt(p, p + Vector3.new(1, 0, 1)), text)
	end
	return m
end

-- Promenade on the sea side of the coastal boulevard.
local function promenade(folder: Instance, rng: Random)
	local m = B.model("Promenade", folder)
	local zRoad = CityLayout.ZS[#CityLayout.ZS] + CityLayout.roadWidthH(#CityLayout.ZS) / 2
	local z1 = CityLayout.BEACH_Z + 6
	local x0, x1 = CityLayout.COAST_X0 - 20, CityLayout.COAST_X1 + 30
	local depth = z1 - zRoad
	B.box(m, CFrame.new((x0 + x1) / 2, WALK_Y / 2, zRoad + depth / 2), Vector3.new(x1 - x0, WALK_Y, depth), Color3.fromRGB(222, 212, 192), M.SmoothPlastic)
	-- railing along the beach edge with gaps for stairs
	local railCol = Color3.fromRGB(236, 236, 232)
	local x = x0
	while x < x1 - 30 do
		local segLen = 46
		B.box(m, CFrame.new(x + segLen / 2, WALK_Y + 3, z1 - 0.3), Vector3.new(segLen, 0.3, 0.3), railCol, M.Metal)
		B.box(m, CFrame.new(x + segLen / 2, WALK_Y + 1.6, z1 - 0.3), Vector3.new(segLen, 0.2, 0.2), railCol, M.Metal)
		for k = 0, 6 do
			B.box(m, CFrame.new(x + k * segLen / 6, WALK_Y + 1.5, z1 - 0.3), Vector3.new(0.3, 3, 0.3), railCol, M.Metal)
		end
		-- stairs down to the sand
		for s = 0, 3 do
			B.box(m, CFrame.new(x + segLen + 6, WALK_Y - s * 0.25, z1 + 1 + s * 1.6), Vector3.new(10, 0.5, 1.6), Color3.fromRGB(210, 200, 180), M.SmoothPlastic)
		end
		x += segLen + 12
	end
	-- palms, classic lamps, benches facing the sea
	local k = 0
	x = x0 + 20
	while x < x1 - 10 do
		k += 1
		local p = Vector3.new(x, WALK_Y, zRoad + depth * 0.45)
		if k % 2 == 0 then
			Props.tree(m, CFrame.new(p), "palm", rng)
		else
			Props.streetLamp(m, CFrame.lookAt(p, p + Vector3.new(0, 0, 1)), "classic")
		end
		if k % 3 == 0 then
			local bp = Vector3.new(x + 10, WALK_Y, z1 - 4)
			Props.bench(m, CFrame.lookAt(bp, bp + Vector3.new(0, 0, -1)), Color3.fromRGB(70, 120, 160))
		end
		if k % 9 == 0 then
			Props.simitCart(m, CFrame.lookAt(Vector3.new(x + 4, WALK_Y, zRoad + depth * 0.7), Vector3.new(x + 4, WALK_Y, zRoad)))
		end
		x += 36
	end
	return m
end

function Roads.build(parent: Instance, yieldEvery: (() -> ())?)
	local L = CityLayout.get()
	local rng = Random.new(20261028)
	local folder = B.folder("Roads", parent)
	for i, road in L.roads do
		segment(folder, L, road, rng)
		if yieldEvery and i % 12 == 0 then
			yieldEvery()
		end
	end
	local keys = {}
	for k in L.nodes do
		table.insert(keys, k)
	end
	table.sort(keys)
	for i, k in keys do
		intersection(folder, L, L.nodes[k], rng)
		if yieldEvery and i % 16 == 0 then
			yieldEvery()
		end
	end
	promenade(folder, rng)
	return folder
end

return Roads
