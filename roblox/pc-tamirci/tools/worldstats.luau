-- Builds the city in the headless engine and prints how many parts and lights each part of it
-- costs (by top-level folder and, for the blocks, by district).
--   lune run tools/worldstats.luau

local Engine = require("../tests/lib/Engine")

require("../tests/lib/Bootstrap").run("tools/worldstats.luau")
Engine.context = "server"
Engine.load("build/PCTamirci.rbxlx")

local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
local world = WorldBuilder.build({ bake = true })

local function count(root)
	local parts, lights = 0, 0
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") then
			parts += 1
		elseif d:IsA("Light") then
			lights += 1
		end
	end
	return parts, lights
end

local total = count(world)
print(string.format("city: %d parts", total))
for _, f in world:GetChildren() do
	local p, l = count(f)
	print(string.format("  %-12s %6d parts %4d lights", f.Name, p, l))
	if f.Name ~= "Blocks" then
		local rows = {}
		for _, m in f:GetChildren() do
			local mp, ml = count(m)
			table.insert(rows, { m.Name, mp, ml })
		end
		table.sort(rows, function(a, b)
			return a[2] > b[2]
		end)
		for i = 1, math.min(8, #rows) do
			print(string.format("      %-22s %6d %4d", rows[i][1], rows[i][2], rows[i][3]))
		end
	end
end
local byDistrict = {}
for _, m in world.Blocks:GetChildren() do
	local d = string.match(m.Name, "_(%u+)$") or m.Name
	local p = count(m)
	local e = byDistrict[d] or { n = 0, parts = 0 }
	e.n += 1
	e.parts += p
	byDistrict[d] = e
end
for d, e in byDistrict do
	print(string.format("  block %-4s x%-3d %6d parts (%d each)", d, e.n, e.parts, e.parts // e.n))
end
