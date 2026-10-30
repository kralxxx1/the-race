-- WorldBuilder: builds the whole city once when the server starts.
-- If a pre-built "City" folder already exists in Workspace (baked in Studio), it is reused.
--
-- To bake the city into the place so you can see/edit it in Studio, run in the command bar:
--   require(game.ServerScriptService.Server.World.WorldBuilder).build({ bake = true })
-- then save the place. The server will keep the baked copy on the next start.

local Workspace = game:GetService("Workspace")

local Shared = game:GetService("ReplicatedStorage"):WaitForChild("Shared")
local B = require(Shared.Util.Builder)
local CityLayout = require(Shared.World.CityLayout)

local Terrain = require(script.Parent.TerrainBuilder)
local Roads = require(script.Parent.Roads)
local Blocks = require(script.Parent.Blocks)
local Landmarks = require(script.Parent.Landmarks)

local WorldBuilder = {}

function WorldBuilder.build(opts: { [string]: any }?)
	local o = opts or {}
	local existing = Workspace:FindFirstChild("City")
	if existing and not o.rebuild then
		existing:SetAttribute("Reused", true)
		return existing
	end
	if existing then
		existing:Destroy()
	end
	local t0 = os.clock()
	local world = B.folder("City", nil)
	local ops = 0
	local function yield()
		ops += 1
		if not o.bake and ops % 4 == 0 then
			task.wait()
		end
	end

	-- Every stage runs on its own: if one of them fails (a missing asset, an engine quirk) the rest
	-- of the city still gets built, instead of leaving bare terrain where the failed part would
	-- have been. The failures are listed in the world's "Errors" attribute and the output.
	local failures = {}
	local function stage(name: string, fn: () -> ())
		local ok, err = pcall(fn)
		if not ok then
			table.insert(failures, name .. ": " .. tostring(err))
			warn("[WorldBuilder] " .. name .. " failed: " .. tostring(err))
		end
	end
	stage("terrain", Terrain.build)
	stage("roads", function()
		Roads.build(world, yield)
	end)
	stage("blocks", function()
		Blocks.build(world, yield)
	end)
	stage("landmarks", function()
		Landmarks.build(world, yield)
	end)
	stage("lots", function()
		world:SetAttribute("FilledLots", Blocks.fillPoiSites(world, Random.new(5150)))
	end)
	stage("ground patches", function()
		world:SetAttribute("GroundPatches", Terrain.clearUnder(world))
	end)
	if Blocks.lastError then
		table.insert(failures, "blocks: " .. Blocks.lastError)
	end
	world:SetAttribute("Errors", table.concat(failures, " | "))
	local function count(name: string): number
		local f = world:FindFirstChild(name)
		return if f then #f:GetChildren() else 0
	end
	world:SetAttribute("Counts", string.format("roads %d, blocks %d", count("Roads"), count("Blocks")))

	-- spawn point on the main square
	local L = CityLayout.get()
	local spawn = Instance.new("SpawnLocation")
	spawn.Name = "CitySpawn"
	spawn.Anchored = true
	spawn.Size = Vector3.new(12, 0.4, 12)
	spawn.CFrame = L.spawn * CFrame.new(0, -2.6, 0)
	spawn.Transparency = 1
	spawn.CanCollide = false
	spawn.Neutral = true
	spawn.Duration = 0
	spawn.Parent = world

	world:SetAttribute("BuildSeconds", os.clock() - t0)
	world.Parent = Workspace
	return world
end

return WorldBuilder
