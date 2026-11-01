--[[
	ImportToolbox: puts the published models (the screwdriver, the umbrellas: see
	src/shared/Data/ToolboxAssets.luau) INTO the place file, so the published game does not have to ask
	the Creator Store for them every time a server starts.

	How (once, in Roblox Studio, on the open PCTamirci.rbxl, NOT while playing):
	  1. View > Command Bar
	  2. paste this whole file, press Enter
	  3. look at the output (every model tried, loaded or skipped, and why) and at
	     ReplicatedStorage > Assets > Toolbox (screwdriver, umbrella, umbrella2 ...; the Size and
	     ToolboxId attributes say what each one is)
	  4. File > Save, then File > Publish to Roblox

	It needs "Allow HTTP"-free access only: InsertService:LoadAsset loads free public models for any
	logged-in Studio user. Scripts and everything that is not a part are thrown away (ToolboxFit).
	Run it again to replace the models (set FORCE = true below to load models that are already there).
	If a model comes out upside down, give its id a `tip = "+X"` / `up = "-Y"` hint in
	ToolboxAssets.lua and run it again with FORCE = true.
]]

local FORCE = false

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local ChangeHistoryService = game:GetService("ChangeHistoryService")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Loader = require(Shared.Util.ToolboxLoader)

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

local recording = ChangeHistoryService:TryBeginRecording("Import Toolbox models")
local report = Loader.run(Loader.insertService(), folder, { force = FORCE })
if recording then
	ChangeHistoryService:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
end

print("---- ImportToolbox ----")
for _, line in report do
	print(line)
end
print(string.format("%d models are in ReplicatedStorage.Assets.Toolbox now. Save the place (File > Save).", #folder:GetChildren()))
