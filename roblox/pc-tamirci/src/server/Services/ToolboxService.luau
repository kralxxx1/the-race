-- ToolboxService: brings the ready-made models of Data/ToolboxAssets (a published screwdriver, umbrellas)
-- into the game. Each model is asked for from the Creator Store once, cleaned (scripts and everything
-- that is not a part are thrown away, see Models/ToolboxFit), fitted and put in
-- ReplicatedStorage.Assets.Toolbox, where the bench tools, the umbrellas and the people of the street
-- find them (Assets.get("Toolbox", "screwdriver")). Models that are already in the place (put there
-- once by tools/studio/ImportToolbox.lua) are used as they are, and when a model cannot be had the
-- game's own one stays: nothing depends on this working. The outcome is left in the
-- "ToolboxReport" attribute of Workspace (one line per model tried).

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Config = require(Shared.Config)
local ToolboxLoader = require(Shared.Util.ToolboxLoader)

local ToolboxService = {}

-- Where the models go (made if it is not there yet).
function ToolboxService.folder(): Folder
	local assets = ReplicatedStorage:FindFirstChild("Assets")
	if not assets then
		assets = Instance.new("Folder")
		assets.Name = "Assets"
		assets.Parent = ReplicatedStorage
	end
	local folder = assets:FindFirstChild("Toolbox")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name = "Toolbox"
		folder.Parent = assets
	end
	return folder :: Folder
end

-- Loads what is missing (with `provider`, the Creator Store unless given another one); returns the report.
function ToolboxService.load(provider: ((number) -> (Instance?, string?))?): { string }
	local report = ToolboxLoader.run(provider or ToolboxLoader.insertService(), ToolboxService.folder())
	Workspace:SetAttribute("ToolboxReport", table.concat(report, "\n"))
	return report
end

function ToolboxService.init() end

function ToolboxService.start()
	if Config.ToolboxAssets == false then
		return
	end
	-- (in the background: asking the Creator Store takes a moment and the game does not wait for it)
	task.spawn(function()
		local ok, err = pcall(ToolboxService.load)
		if not ok then
			warn("[ToolboxService] " .. tostring(err))
		end
	end)
end

return ToolboxService
