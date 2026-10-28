-- CityLayout: the deterministic plan of the whole city.
-- The server builds the 3D world from it, clients draw the map, minimap, GPS route and their
-- local traffic/pedestrians from the same data, so nothing about the layout needs replicating.
--
-- Coordinates: X = east, Z = south (north is -Z), ground top at Y = 0.

local Locations = require(script.Parent.Parent.Data.Locations)

local CityLayout = {}

CityLayout.GROUND_Y = 0
CityLayout.ROAD_Y = 0.25 -- asphalt top
CityLayout.WALK_Y = 0.75 -- sidewalk / block top
CityLayout.SEA_Z = 905 -- water starts south of here
CityLayout.BEACH_Z = 846

local XS = { -1200, -960, -720, -480, -240, 0, 240, 480, 720, 960, 1200 }
local ZS = { -1080, -860, -640, -420, -200, 20, 240, 460, 680, 820 }
CityLayout.XS = XS
CityLayout.ZS = ZS

-- District of each block [row][col]
local D = {
	{ "SUB", "SUB", "UNI", "UNI", "PRK", "PRK", "SUB", "SUB", "HOS", "SUB" },
	{ "SUB", "SCH", "UNI", "UNI", "PRK", "PRK", "SUB", "FIR", "SUB", "SUB" },
	{ "IND", "IND", "OLD", "DWN", "DWN", "TEC", "TEC", "TEP", "SUB", "DLR" },
	{ "IND", "SCR", "OLD", "OLD", "PLZ", "TEC", "TEC", "TEC", "DLR", "DLR" },
	{ "IND", "IND", "OLD", "DWN", "DWN", "TEC", "DWN", "SUB", "SPT", "SUB" },
	{ "IND", "DAT", "OLD", "DWN", "DWN", "DWN", "SEA", "LUN", "LUN", "SUB" },
	{ "HAR", "HAR", "SEA", "SEA", "SEA", "SEA", "SEA", "LUN", "LUN", "SUB" },
	{ "HAR", "HAR", "SEA", "SEA", "SEA", "SEA", "SEA", "MAR", "MAR", "SUB" },
	{ "HAR", "HAR", "CST", "CST", "CST", "CST", "CST", "CST", "CST", "CST" },
}
CityLayout.DistrictGrid = D

-- Blocks merged into one big site: { rowFrom, rowTo, colFrom, colTo, id }
local MERGED = {
	{ 1, 2, 5, 6, "park" },
	{ 1, 2, 3, 4, "university" },
	{ 6, 7, 8, 9, "lunapark" },
	{ 7, 9, 1, 2, "harbor" },
	{ 8, 8, 8, 9, "marina" },
}

CityLayout.Districts = {
	SUB = { name = { tr = "Banliyö", en = "Suburbs" }, color = { 160, 196, 140 } },
	SCH = { name = { tr = "Okul", en = "School" }, color = { 170, 190, 220 } },
	FIR = { name = { tr = "İtfaiye", en = "Fire Station" }, color = { 220, 120, 110 } },
	UNI = { name = { tr = "Üniversite", en = "University" }, color = { 170, 190, 220 } },
	PRK = { name = { tr = "Göl Park", en = "Lake Park" }, color = { 110, 180, 100 } },
	HOS = { name = { tr = "Hastane", en = "Hospital" }, color = { 220, 230, 240 } },
	IND = { name = { tr = "Sanayi", en = "Industrial" }, color = { 170, 160, 150 } },
	SCR = { name = { tr = "Hurdalık", en = "Scrapyard" }, color = { 150, 120, 90 } },
	DAT = { name = { tr = "Veri Merkezi", en = "Data Centre" }, color = { 140, 150, 170 } },
	OLD = { name = { tr = "Eski Çarşı", en = "Old Bazaar" }, color = { 220, 180, 130 } },
	DWN = { name = { tr = "Şehir Merkezi", en = "Downtown" }, color = { 190, 190, 205 } },
	PLZ = { name = { tr = "Cumhuriyet Meydanı", en = "Republic Square" }, color = { 230, 215, 170 } },
	TEC = { name = { tr = "Teknoloji Çarşısı", en = "Tech Bazaar" }, color = { 140, 200, 230 } },
	TEP = { name = { tr = "Teknoloji Çarşısı", en = "Tech Bazaar" }, color = { 140, 200, 230 } },
	DLR = { name = { tr = "Galeriler", en = "Dealerships" }, color = { 230, 150, 150 } },
	SPT = { name = { tr = "Stadyum", en = "Stadium" }, color = { 120, 190, 120 } },
	LUN = { name = { tr = "Lunapark", en = "Funfair" }, color = { 240, 170, 200 } },
	SEA = { name = { tr = "Sahil", en = "Seaside" }, color = { 150, 210, 220 } },
	CST = { name = { tr = "Sahil Şeridi", en = "Promenade" }, color = { 230, 220, 180 } },
	HAR = { name = { tr = "Liman", en = "Harbour" }, color = { 120, 140, 160 } },
	MAR = { name = { tr = "Yat Limanı", en = "Marina" }, color = { 150, 200, 230 } },
}

-- Blocks that hold player shop plots (6 per block = 66 plots)
local PLOT_BLOCKS = {
	{ 3, 6 }, { 3, 7 }, { 4, 6 }, { 4, 7 }, { 4, 8 }, { 5, 6 }, -- Tech Bazaar
	{ 3, 4 }, { 5, 7 }, -- Downtown
	{ 5, 3 }, -- Old Bazaar
	{ 6, 7 }, { 7, 5 }, -- Seaside
}

-- POI sites: { id, row, col, part }  part = "n" | "s" | "full" | "group"
local POI_SITES = {
	{ "megastore", 3, 8, "n" },
	{ "mall", 3, 8, "s" },
	{ "covered_bazaar", 3, 3, "n" },
	{ "bazaar_parts", 3, 3, "s" },
	{ "used_market", 4, 3, "n" },
	{ "flea_market", 4, 3, "s" },
	{ "toolshop", 4, 4, "n" },
	{ "old_han", 4, 4, "s" },
	{ "teahouse", 6, 3, "n" },
	{ "market_hall", 6, 3, "s" },
	{ "scrapyard", 4, 2, "full" },
	{ "bicycle_shop", 3, 10, "n" },
	{ "gas_north", 3, 10, "s" },
	{ "bike_dealer", 4, 9, "full" },
	{ "car_dealer", 4, 10, "full" },
	{ "staff_agency", 3, 5, "n" },
	{ "realty", 3, 5, "s" },
	{ "police", 5, 4, "n" },
	{ "internet_cafe", 5, 4, "s" },
	{ "cinema", 5, 5, "n" },
	{ "arena", 5, 5, "s" },
	{ "kebab", 6, 4, "n" },
	{ "bakery", 6, 4, "s" },
	{ "pizzeria", 6, 5, "n" },
	{ "post", 6, 5, "s" },
	{ "gym", 6, 6, "n" },
	{ "hotel", 6, 6, "s" },
	{ "plaza", 4, 5, "full" },
	{ "datacenter", 6, 2, "full" },
	{ "cargo", 3, 1, "n" },
	{ "gas_west", 3, 1, "s" },
	{ "industrial", 5, 1, "full" },
	{ "hospital", 1, 9, "full" },
	{ "school", 2, 2, "full" },
	{ "fire_station", 2, 8, "full" },
	{ "university", 1, 3, "group" },
	{ "park", 1, 5, "group" },
	{ "lunapark", 6, 8, "group" },
	{ "harbor", 7, 1, "group" },
	{ "marina", 8, 8, "group" },
	{ "stadium", 5, 9, "full" },
	{ "fish", 9, 4, "full" },
	{ "icecream", 9, 6, "full" },
}

-- Places outside the grid (absolute positions)
local FREE_POIS = {
	{ "pier", Vector3.new(-120, 0, 960) },
	{ "lighthouse", Vector3.new(1150, 0, 985) },
	{ "beach", Vector3.new(420, 0, 870) },
	{ "viewpoint", Vector3.new(0, 62, -1360) },
	{ "radio_tower", Vector3.new(380, 62, -1400) },
	{ "windfarm", Vector3.new(-620, 0, -1300) },
	{ "camp", Vector3.new(760, 0, -1280) },
	{ "farm", Vector3.new(1380, 0, -350) },
	{ "clocktower", nil },
	{ "cafe_plaza", nil },
	{ "cityhall", nil },
	{ "bank", nil },
	{ "library", nil },
}

local VNAMES = { "Batı Çevre Yolu", "Fabrika Caddesi", "Han Sokak", "Kervan Caddesi", "Saray Caddesi", "Cumhuriyet Caddesi", "Teknoloji Caddesi", "Çip Sokak", "Galeri Caddesi", "Lale Sokak", "Doğu Çevre Yolu" }
local HNAMES = { "Kuzey Çevre Yolu", "Kampüs Caddesi", "Park Caddesi", "Çarşı Caddesi", "Meydan Caddesi", "İstiklal Bulvarı", "Liman Caddesi", "Martı Sokak", "Kumsal Caddesi", "Sahil Bulvarı" }

local function roadWidthV(i: number): number
	if i == 1 or i == #XS then
		return 52
	elseif XS[i] == 0 then
		return 60
	end
	return 44
end
local function roadWidthH(j: number): number
	if j == 1 or j == #ZS then
		return 52
	elseif ZS[j] == 20 then
		return 60
	end
	return 44
end
CityLayout.roadWidthV = roadWidthV
CityLayout.roadWidthH = roadWidthH

local function mergedAt(r: number, c: number)
	for _, m in MERGED do
		if r >= m[1] and r <= m[2] and c >= m[3] and c <= m[4] then
			return m
		end
	end
	return nil
end

-- Vertical segment on line i between rows r (z from ZS[r] to ZS[r+1])
local function verticalOmitted(i: number, r: number): boolean
	for _, m in MERGED do
		if r >= m[1] and r <= m[2] and i > m[3] and i <= m[4] then
			return true
		end
	end
	return false
end
-- Horizontal segment on line j between cols c
local function horizontalOmitted(j: number, c: number): boolean
	for _, m in MERGED do
		if c >= m[3] and c <= m[4] and j > m[1] and j <= m[2] then
			return true
		end
	end
	-- the harbour runs straight into the sea: no coastal boulevard in front of it
	if j == #ZS and c <= 2 then
		return true
	end
	return false
end

local cached = nil

function CityLayout.get()
	if cached then
		return cached
	end
	local L = {
		bounds = { minX = -1550, maxX = 1550, minZ = -1550, maxZ = 1300 },
		roads = {},
		nodes = {},
		blocks = {},
		blockAt = {},
		plots = {},
		pois = {},
		poiById = {},
	}

	-- Roads and intersection graph
	local function nodeKey(i, j)
		return i .. "_" .. j
	end
	local function ensureNode(i, j)
		local k = nodeKey(i, j)
		local n = L.nodes[k]
		if not n then
			n = { key = k, x = XS[i], z = ZS[j], i = i, j = j, links = {} }
			L.nodes[k] = n
		end
		return n
	end
	local function addRoad(a, b, width, kind, name)
		local road = {
			id = #L.roads + 1,
			a = Vector2.new(a.x, a.z),
			b = Vector2.new(b.x, b.z),
			width = width,
			kind = kind,
			name = name,
			from = a.key,
			to = b.key,
			vertical = a.x == b.x,
		}
		table.insert(L.roads, road)
		table.insert(a.links, { node = b.key, road = road.id })
		table.insert(b.links, { node = a.key, road = road.id })
		return road
	end
	for i = 1, #XS do
		for r = 1, #ZS - 1 do
			if not verticalOmitted(i, r) then
				local a, b = ensureNode(i, r), ensureNode(i, r + 1)
				local w = roadWidthV(i)
				addRoad(a, b, w, if w == 52 then "ring" elseif w == 60 then "main" else "street", VNAMES[i])
			end
		end
	end
	for j = 1, #ZS do
		for c = 1, #XS - 1 do
			if not horizontalOmitted(j, c) then
				local a, b = ensureNode(c, j), ensureNode(c + 1, j)
				local w = roadWidthH(j)
				addRoad(a, b, w, if w == 52 then "ring" elseif w == 60 then "main" else "street", HNAMES[j])
			end
		end
	end

	-- Blocks (interior rectangles between road edges)
	local seenGroup = {}
	for r = 1, #ZS - 1 do
		for c = 1, #XS - 1 do
			local m = mergedAt(r, c)
			if m then
				if not seenGroup[m[5]] then
					seenGroup[m[5]] = true
					local x0 = XS[m[3]] + roadWidthV(m[3]) / 2
					local x1 = XS[m[4] + 1] - roadWidthV(m[4] + 1) / 2
					local z0 = ZS[m[1]] + roadWidthH(m[1]) / 2
					local z1 = ZS[m[2] + 1] - roadWidthH(m[2] + 1) / 2
					if m[5] == "harbor" then
						z1 = CityLayout.SEA_Z - 25
					end
					local block = { id = #L.blocks + 1, row = m[1], col = m[3], x0 = x0, x1 = x1, z0 = z0, z1 = z1, district = D[m[1]][m[3]], group = m[5] }
					table.insert(L.blocks, block)
					for rr = m[1], m[2] do
						for cc = m[3], m[4] do
							L.blockAt[rr .. "_" .. cc] = block
						end
					end
				end
			else
				local x0 = XS[c] + roadWidthV(c) / 2
				local x1 = XS[c + 1] - roadWidthV(c + 1) / 2
				local z0 = ZS[r] + roadWidthH(r) / 2
				local z1 = ZS[r + 1] - roadWidthH(r + 1) / 2
				local block = { id = #L.blocks + 1, row = r, col = c, x0 = x0, x1 = x1, z0 = z0, z1 = z1, district = D[r][c] }
				table.insert(L.blocks, block)
				L.blockAt[r .. "_" .. c] = block
			end
		end
	end

	-- Plots
	for _, rc in PLOT_BLOCKS do
		local b = L.blockAt[rc[1] .. "_" .. rc[2]]
		b.plots = {}
		local margin = 4
		local w = (b.x1 - b.x0 - margin * 2) / 3
		local depth = (b.z1 - b.z0 - 8) / 2
		for side = 1, 2 do
			for k = 1, 3 do
				local cx = b.x0 + margin + w * (k - 0.5)
				local front, look
				if side == 1 then
					front = Vector3.new(cx, CityLayout.WALK_Y, b.z0)
					look = Vector3.new(0, 0, -1)
				else
					front = Vector3.new(cx, CityLayout.WALK_Y, b.z1)
					look = Vector3.new(0, 0, 1)
				end
				local plot = {
					id = #L.plots + 1,
					cf = CFrame.lookAt(front, front + look),
					width = w,
					depth = depth,
					block = b.id,
					district = b.district,
				}
				table.insert(L.plots, plot)
				table.insert(b.plots, plot.id)
			end
		end
		b.kind = "plots"
	end

	-- POIs
	local function site(b, part)
		if part == "n" then
			return { x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = (b.z0 + b.z1) / 2 - 4, face = "n" }
		elseif part == "s" then
			return { x0 = b.x0, x1 = b.x1, z0 = (b.z0 + b.z1) / 2 + 4, z1 = b.z1, face = "s" }
		end
		return { x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1, face = "n" }
	end
	for _, s in POI_SITES do
		local def = Locations.get(s[1])
		local b = L.blockAt[s[2] .. "_" .. s[3]]
		assert(def and b, "bad poi site " .. s[1])
		local st = site(b, s[4])
		local pos = Vector3.new((st.x0 + st.x1) / 2, CityLayout.WALK_Y, (st.z0 + st.z1) / 2)
		local door = Vector3.new(pos.X, CityLayout.WALK_Y, if st.face == "n" then st.z0 + 4 else st.z1 - 4)
		local poi = { id = s[1], def = def, block = b.id, site = st, pos = pos, door = door }
		table.insert(L.pois, poi)
		L.poiById[s[1]] = poi
		b.pois = b.pois or {}
		table.insert(b.pois, s[1])
		b.kind = b.kind or "poi"
	end
	-- Sub-landmarks inside the plaza / campus
	local plaza = L.poiById.plaza
	local function sub(id, offset: Vector3)
		local def = Locations.get(id)
		local poi = { id = id, def = def, block = plaza.block, pos = plaza.pos + offset, door = plaza.pos + offset, parent = "plaza" }
		table.insert(L.pois, poi)
		L.poiById[id] = poi
	end
	sub("clocktower", Vector3.new(0, 0, 0))
	sub("cityhall", Vector3.new(0, 0, -70))
	sub("bank", Vector3.new(76, 0, -10))
	sub("cafe_plaza", Vector3.new(-76, 0, 20))
	local uni = L.poiById.university
	do
		local def = Locations.get("library")
		local poi = { id = "library", def = def, block = uni.block, pos = uni.pos + Vector3.new(120, 0, 90), door = uni.pos + Vector3.new(120, 0, 90), parent = "university" }
		table.insert(L.pois, poi)
		L.poiById.library = poi
	end
	for _, f in FREE_POIS do
		if f[2] then
			local def = Locations.get(f[1])
			local poi = { id = f[1], def = def, pos = f[2], door = f[2], free = true }
			table.insert(L.pois, poi)
			L.poiById[f[1]] = poi
		end
	end

	-- Everything else gets a default kind by district
	for _, b in L.blocks do
		if not b.kind then
			b.kind = string.lower(b.district)
		end
	end

	L.spawn = CFrame.new(plaza.pos + Vector3.new(0, 3, 38))
	cached = L
	return L
end

-- Road segment (and side) nearest to a point; used for GPS, taxis and vehicle spawns.
function CityLayout.nearestRoad(pos: Vector3)
	local L = CityLayout.get()
	local best, bestD, bestPoint = nil, math.huge, nil
	local p = Vector2.new(pos.X, pos.Z)
	for _, r in L.roads do
		local ab = r.b - r.a
		local t = math.clamp((p - r.a):Dot(ab) / ab:Dot(ab), 0, 1)
		local q = r.a + ab * t
		local d = (p - q).Magnitude
		if d < bestD then
			best, bestD, bestPoint = r, d, q
		end
	end
	return best, bestPoint, bestD
end

-- Nearest intersection node key.
function CityLayout.nearestNode(pos: Vector3): string
	local L = CityLayout.get()
	local best, bestD = nil, math.huge
	for k, n in L.nodes do
		local d = (n.x - pos.X) ^ 2 + (n.z - pos.Z) ^ 2
		if d < bestD then
			best, bestD = k, d
		end
	end
	return best
end

-- A* over the intersection graph. Returns a list of node keys.
function CityLayout.route(fromKey: string, toKey: string): { string }
	local L = CityLayout.get()
	local nodes = L.nodes
	local function h(a, b)
		return math.abs(nodes[a].x - nodes[b].x) + math.abs(nodes[a].z - nodes[b].z)
	end
	local open = { [fromKey] = true }
	local came = {}
	local g = { [fromKey] = 0 }
	local f = { [fromKey] = h(fromKey, toKey) }
	local guard = 0
	while next(open) and guard < 5000 do
		guard += 1
		local cur, curF = nil, math.huge
		for k in open do
			if f[k] < curF then
				cur, curF = k, f[k]
			end
		end
		if cur == toKey then
			local path = { cur }
			while came[cur] do
				cur = came[cur]
				table.insert(path, 1, cur)
			end
			return path
		end
		open[cur] = nil
		for _, link in nodes[cur].links do
			local nb = link.node
			local cost = g[cur] + math.abs(nodes[cur].x - nodes[nb].x) + math.abs(nodes[cur].z - nodes[nb].z)
			if g[nb] == nil or cost < g[nb] then
				came[nb] = cur
				g[nb] = cost
				f[nb] = cost + h(nb, toKey)
				open[nb] = true
			end
		end
	end
	return { fromKey, toKey }
end

-- Which district a point is in (for ambience zones and the HUD).
function CityLayout.districtAt(pos: Vector3): string
	local L = CityLayout.get()
	if pos.Z > CityLayout.BEACH_Z then
		return "BEACH"
	end
	if pos.Z < ZS[1] - 30 then
		return "HILLS"
	end
	if pos.X < XS[1] - 30 or pos.X > XS[#XS] + 30 then
		return "COUNTRY"
	end
	for _, b in L.blocks do
		if pos.X >= b.x0 - 30 and pos.X <= b.x1 + 30 and pos.Z >= b.z0 - 30 and pos.Z <= b.z1 + 30 then
			return b.district
		end
	end
	return "DWN"
end

return CityLayout
