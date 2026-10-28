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
}
Terrain.Hills = HILLS

local LAKE = { x = -120, z = -820, radius = 70 }
Terrain.SEA_LEVEL = -1.5
Terrain.Lake = LAKE

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
	-- land
	local landDepth = seaZ - b.minZ
	terrain:FillBlock(CFrame.new(0, -6, b.minZ + landDepth / 2), Vector3.new(b.maxX - b.minX, 12, landDepth), M.Grass)
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
	-- deep harbour basin in front of the container quay
	terrain:FillBlock(CFrame.new(-955, (SEA_LEVEL - 20) / 2, 990), Vector3.new(470, SEA_LEVEL + 20, 220), M.Water)
	terrain:FillBlock(CFrame.new(-955, -6, 868), Vector3.new(470, 12, 24), M.Grass)
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

return Terrain
