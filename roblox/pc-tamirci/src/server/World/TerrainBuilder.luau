-- Terrain: grass ground, the beach and the sea, the northern hills and the park lake.
-- Also exposes groundHeight(x, z) so trees and props on the hills sit on the surface.

local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local CityLayout = require(Shared.World.CityLayout)

local Terrain = {}

-- Rolling hills north of the ring road: { x, z, radius, centreY }
local HILLS = {
	{ 0, -1360, 230, -175 }, -- viewpoint hill (top ~ y 55)
	{ -420, -1420, 260, -205 },
	{ 420, -1430, 250, -200 },
	{ -860, -1380, 220, -180 },
	{ 860, -1400, 230, -185 },
	{ -1260, -1300, 200, -170 },
	{ 1260, -1320, 210, -175 },
	{ -1700, -1380, 230, -190 },
	{ 1700, -1390, 230, -185 },
	{ -2120, -1330, 220, -175 },
	{ 2120, -1350, 220, -180 },
}
Terrain.Hills = HILLS

local LAKE = { x = -120, z = -820, radius = 70 }
Terrain.SEA_LEVEL = -1.5
Terrain.Lake = LAKE

-- The paved city: every block and road plus a margin. Grass terrain grows blades about a stud
-- tall that poke through roads, pavements and floors, so the city stands on a paved base (never
-- brown dirt: wherever a building or slab has not streamed in yet, you see pavement) and only the
-- lawns (park blocks) and the countryside around it are grass.
local urban = nil
function Terrain.urbanRect()
	if urban then
		return urban
	end
	local L = CityLayout.get()
	local x0, x1, z0, z1 = math.huge, -math.huge, math.huge, -math.huge
	for _, b in L.blocks do
		x0, x1 = math.min(x0, b.x0), math.max(x1, b.x1)
		z0, z1 = math.min(z0, b.z0), math.max(z1, b.z1)
	end
	for _, r in L.roads do
		local w = r.width / 2
		x0, x1 = math.min(x0, r.a.X - w, r.b.X - w), math.max(x1, r.a.X + w, r.b.X + w)
		z0, z1 = math.min(z0, r.a.Y - w, r.b.Y - w), math.max(z1, r.a.Y + w, r.b.Y + w)
	end
	urban = { x0 = x0 - 2, x1 = x1 + 2, z0 = z0 - 2, z1 = math.min(z1 + 2, CityLayout.BEACH_Z) }
	return urban
end

-- Lawns inside the city (park blocks keep their terrain grass).
function Terrain.lawns()
	local out = {}
	for _, b in CityLayout.get().blocks do
		if b.district == "PRK" then
			table.insert(out, { x0 = b.x0, x1 = b.x1, z0 = b.z0, z1 = b.z1 })
		end
	end
	return out
end

local function inRect(r, x: number, z: number): boolean
	return x >= r.x0 and x <= r.x1 and z >= r.z0 and z <= r.z1
end

-- True where the terrain surface is grass (countryside, hills, park lawns).
function Terrain.isGrass(x: number, z: number): boolean
	if z >= CityLayout.BEACH_Z then
		return false
	end
	if not inRect(Terrain.urbanRect(), x, z) then
		return true
	end
	for _, lawn in Terrain.lawns() do
		if inRect(lawn, x, z) then
			return true
		end
	end
	return false
end

-- Height of the terrain surface (approximate) at x, z.
function Terrain.groundHeight(x: number, z: number): number
	local h = 0
	for _, hill in HILLS do
		local dx, dz = x - hill[1], z - hill[2]
		local r = hill[3]
		local d2 = dx * dx + dz * dz
		if d2 < r * r then
			local top = hill[4] + math.sqrt(r * r - d2)
			if top > h then
				h = top
			end
		end
	end
	return h
end

function Terrain.build()
	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if not terrain then
		return
	end
	local M = Enum.Material
	pcall(function()
		terrain:SetMaterialColor(M.Grass, Color3.fromRGB(96, 140, 70))
		terrain:SetMaterialColor(M.LeafyGrass, Color3.fromRGB(86, 128, 62))
		terrain:SetMaterialColor(M.Sand, Color3.fromRGB(230, 212, 168))
		terrain:SetMaterialColor(M.Ground, Color3.fromRGB(120, 100, 76))
		terrain:SetMaterialColor(M.Pavement, Color3.fromRGB(158, 157, 152))
		terrain:SetMaterialColor(M.Concrete, Color3.fromRGB(146, 147, 150))
		terrain:SetMaterialColor(M.Rock, Color3.fromRGB(130, 126, 120))
		terrain:SetMaterialColor(M.Mud, Color3.fromRGB(96, 80, 62))
	end)
	pcall(function()
		terrain.WaterColor = Color3.fromRGB(30, 104, 128)
		terrain.WaterReflectance = 0.45
		terrain.WaterTransparency = 0.35
		terrain.WaterWaveSize = 0.18
		terrain.WaterWaveSpeed = 7
	end)
	pcall(function()
		(terrain :: any).Decoration = true
	end)

	local b = CityLayout.get().bounds
	local seaZ = CityLayout.SEA_Z
	-- land: grass around the city, pavement under it, lawns in the park
	local landDepth = seaZ - b.minZ
	terrain:FillBlock(CFrame.new(0, -6, b.minZ + landDepth / 2), Vector3.new(b.maxX - b.minX, 12, landDepth), M.Grass)
	local u = Terrain.urbanRect()
	terrain:FillBlock(CFrame.new((u.x0 + u.x1) / 2, -6, (u.z0 + u.z1) / 2), Vector3.new(u.x1 - u.x0, 12, u.z1 - u.z0), M.Pavement)
	for _, lawn in Terrain.lawns() do
		terrain:FillBlock(CFrame.new((lawn.x0 + lawn.x1) / 2, -6, (lawn.z0 + lawn.z1) / 2), Vector3.new(lawn.x1 - lawn.x0, 12, lawn.z1 - lawn.z0), M.Grass)
	end
	-- beach sand, sloping under the water in 16-stud bands
	local W = b.maxX - b.minX + 800
	local SEA_LEVEL = Terrain.SEA_LEVEL
	terrain:FillBlock(CFrame.new(0, -6, (CityLayout.BEACH_Z + seaZ) / 2), Vector3.new(W, 12, seaZ - CityLayout.BEACH_Z + 4), M.Sand)
	for i = 0, 8 do
		local z = seaZ + i * 16 + 8
		local sandTop = -0.5 - i * 2.4
		terrain:FillBlock(CFrame.new(0, (sandTop - 44) / 2, z), Vector3.new(W, sandTop + 44, 16), M.Sand)
		if sandTop < SEA_LEVEL then
			terrain:FillBlock(CFrame.new(0, (SEA_LEVEL + sandTop) / 2, z), Vector3.new(W, SEA_LEVEL - sandTop, 16), M.Water)
		end
	end
	-- open sea
	local z0 = seaZ + 9 * 16
	local seaLen = b.maxZ + 600 - z0
	terrain:FillBlock(CFrame.new(0, -32, z0 + seaLen / 2), Vector3.new(W, 24, seaLen), M.Sand)
	terrain:FillBlock(CFrame.new(0, (SEA_LEVEL - 20) / 2, z0 + seaLen / 2), Vector3.new(W, SEA_LEVEL + 20, seaLen), M.Water)
	-- the blocks that run down to the water (the container port, the shipyard): solid ground under
	-- their quay and a deep basin in front
	for _, blk in CityLayout.get().blocks do
		if blk.z1 > CityLayout.BEACH_Z then
			local cx, w = (blk.x0 + blk.x1) / 2, blk.x1 - blk.x0 + 8
			terrain:FillBlock(CFrame.new(cx, (SEA_LEVEL - 20) / 2, blk.z1 + 110), Vector3.new(w, SEA_LEVEL + 20, 220), M.Water)
			terrain:FillBlock(CFrame.new(cx, -6, (CityLayout.BEACH_Z + blk.z1) / 2 + 4), Vector3.new(w, 12, blk.z1 - CityLayout.BEACH_Z + 8), M.Concrete)
		end
	end
	-- northern hills
	for _, hill in HILLS do
		terrain:FillBall(Vector3.new(hill[1], hill[4], hill[2]), hill[3], M.Grass)
	end
	-- rocky crown and a flat lookout on the viewpoint hill
	terrain:FillCylinder(CFrame.new(0, 52, -1360), 6, 46, M.Ground)
	terrain:FillBall(Vector3.new(-40, 40, -1400), 22, M.Rock)
	-- dirt road from the north ring road up to the viewpoint
	local path = {
		Vector3.new(0, 0, -1110),
		Vector3.new(-90, 0, -1170),
		Vector3.new(-40, 0, -1250),
		Vector3.new(70, 0, -1290),
		Vector3.new(30, 0, -1340),
	}
	for i = 1, #path - 1 do
		local a, c = path[i], path[i + 1]
		local steps = 8
		for s = 0, steps - 1 do
			local t0, t1 = s / steps, (s + 1) / steps
			local p0 = a:Lerp(c, t0)
			local p1 = a:Lerp(c, t1)
			p0 = Vector3.new(p0.X, Terrain.groundHeight(p0.X, p0.Z), p0.Z)
			p1 = Vector3.new(p1.X, Terrain.groundHeight(p1.X, p1.Z), p1.Z)
			local mid = (p0 + p1) / 2
			local len = (p1 - p0).Magnitude
			if len > 0.5 then
				terrain:FillBlock(CFrame.lookAt(mid, p1) * CFrame.new(0, -0.5, 0), Vector3.new(20, 3, len + 4), M.Ground)
			end
		end
	end
	Terrain.hillPath = path
	-- lake in the park
	terrain:FillCylinder(CFrame.new(LAKE.x, -3.5, LAKE.z), 7, LAKE.radius, M.Water)
	terrain:FillCylinder(CFrame.new(LAKE.x, -8, LAKE.z), 3, LAKE.radius, M.Mud)
	terrain:FillCylinder(CFrame.new(LAKE.x + 40, -3.5, LAKE.z + 30), 7, 38, M.Water)
end

-- Bare ground under everything thin that lies on grass terrain (park paths, flower beds, bench
-- legs, the lookout...), so no grass blade pokes through it. Returns how many patches it made.
function Terrain.clearUnder(root: Instance): number
	local terrain = Workspace:FindFirstChildOfClass("Terrain")
	if not terrain then
		return 0
	end
	local n = 0
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 1 then
			local cf, size = d.CFrame, d.Size
			local p = cf.Position
			-- on grass if the middle or any corner of the footprint is (parts can straddle a lawn's edge)
			local onGrass = Terrain.isGrass(p.X, p.Z)
			if not onGrass then
				for _, c in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
					local q = cf * Vector3.new(c[1] * size.X / 2, 0, c[2] * size.Z / 2)
					if Terrain.isGrass(q.X, q.Z) then
						onGrass = true
						break
					end
				end
			end
			if onGrass then
				local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
				local halfY = (math.abs(r.Y) * size.X + math.abs(u.Y) * size.Y + math.abs(l.Y) * size.Z) / 2
				local gy = Terrain.groundHeight(p.X, p.Z)
				if p.Y - halfY - gy < 1.5 and halfY < 2 then
					local ex = math.abs(r.X) * size.X + math.abs(u.X) * size.Y + math.abs(l.X) * size.Z
					local ez = math.abs(r.Z) * size.X + math.abs(u.Z) * size.Y + math.abs(l.Z) * size.Z
					local lo, hi = gy, gy
					for _, c in { { -1, -1 }, { 1, -1 }, { -1, 1 }, { 1, 1 } } do
						local h = Terrain.groundHeight(p.X + c[1] * ex / 2, p.Z + c[2] * ez / 2)
						lo, hi = math.min(lo, h), math.max(hi, h)
					end
					if hi - lo > 0.5 then
						-- on a slope: turn the grass in the footprint's box to ground, keeping the shape
						local region = Region3.new(Vector3.new(p.X - ex / 2 - 1, lo - 4, p.Z - ez / 2 - 1), Vector3.new(p.X + ex / 2 + 1, hi + 2, p.Z + ez / 2 + 1))
						terrain:ReplaceMaterial(region:ExpandToGrid(4), 4, Enum.Material.Grass, Enum.Material.Ground)
					elseif math.abs(u.Y) > 0.95 then
						-- lying flat: the same footprint, turned with the part
						local _, yaw = cf:ToOrientation()
						terrain:FillBlock(CFrame.new(p.X, gy - 2, p.Z) * CFrame.Angles(0, yaw, 0), Vector3.new(size.X + 1, 4, size.Z + 1), Enum.Material.Ground)
					else
						terrain:FillBlock(CFrame.new(p.X, gy - 2, p.Z), Vector3.new(ex + 1, 4, ez + 1), Enum.Material.Ground)
					end
					n += 1
				end
			end
		end
	end
	return n
end

return Terrain
