-- ToolboxLoader: fetches the models of Data/ToolboxAssets from the Creator Store, fits them
-- (Models/ToolboxFit) and puts the result where Assets.get("Toolbox", name) finds it:
-- ReplicatedStorage.Assets.Toolbox. Used by the server at start (ToolboxService) and by the Studio
-- importer (tools/studio/ImportToolbox.lua); the headless tests give it a made-up provider.
--
--   provider(id) -> Instance?, string?   returns whatever was loaded for the asset id (or nil, why)
--   Loader.insertService()               the real provider: InsertService:LoadAsset

local Manifest = require(script.Parent.Parent.Data.ToolboxAssets)
local ToolboxFit = require(script.Parent.Parent.Models.ToolboxFit)

local ToolboxLoader = {}

-- The provider that asks InsertService (free, public models load in a live game and in Studio).
function ToolboxLoader.insertService(): (number) -> (Instance?, string?)
	local ok, service = pcall(function()
		return game:GetService("InsertService")
	end)
	return function(id: number): (Instance?, string?)
		if not ok or not service then
			return nil, "InsertService is not available"
		end
		local loaded, result = pcall(function()
			return (service :: any):LoadAsset(id)
		end)
		if loaded and typeof(result) == "Instance" then
			return result, nil
		end
		return nil, tostring(result)
	end
end

-- Loads and fits the candidates of one slot: the fitted models (named slot, slot2, slot3...) and a
-- line of report for every candidate that was tried.
function ToolboxLoader.slot(slotName: string, provider: (number) -> (Instance?, string?)): ({ Model }, { string })
	local spec = Manifest.slots[slotName]
	local out: { Model } = {}
	local report: { string } = {}
	if not spec then
		return out, { slotName .. ": no such slot" }
	end
	for _, entry in spec.ids do
		if #out >= (spec.keep or 1) then
			break
		end
		local id = Manifest.idOf(entry)
		local okCall, src, why = pcall(provider, id)
		if not okCall or not src then
			table.insert(report, string.format("%s %d: not loaded (%s)", slotName, id, tostring(if okCall then why else src)))
		else
			local hint = if type(entry) == "table" then entry else nil
			local okFit, fitted, reason = pcall(ToolboxFit.fit, src, spec, hint)
			pcall(function()
				(src :: Instance):Destroy()
			end)
			if okFit and fitted then
				fitted.Name = if #out == 0 then slotName else slotName .. tostring(#out + 1)
				-- (as text: ids go past what an attribute number keeps exactly)
				fitted:SetAttribute("ToolboxId", tostring(id))
				table.insert(out, fitted)
				table.insert(report, string.format("%s %d: ok", slotName, id))
			else
				table.insert(report, string.format("%s %d: skipped (%s)", slotName, id, tostring(if okFit then reason else fitted)))
			end
		end
	end
	return out, report
end

-- Does the folder already hold a model for this slot (put there by the importer, or loaded before)?
function ToolboxLoader.has(folder: Instance, slotName: string): boolean
	return folder:FindFirstChild(slotName) ~= nil
end

-- Loads every slot that is not in `folder` yet (all of them with opts.force) and puts the models in.
-- Returns the report (a list of lines) and also leaves it in the folder's "Report" attribute.
function ToolboxLoader.run(provider: (number) -> (Instance?, string?), folder: Instance, opts: { force: boolean? }?): { string }
	local report: { string } = {}
	local force = opts ~= nil and opts.force == true
	for _, slotName in Manifest.order do
		if not force and ToolboxLoader.has(folder, slotName) then
			table.insert(report, slotName .. ": already in the place")
		else
			local models, lines = ToolboxLoader.slot(slotName, provider)
			for _, l in lines do
				table.insert(report, l)
			end
			if #models > 0 then
				-- (what was there before is replaced)
				for _, old in folder:GetChildren() do
					if old.Name == slotName or (string.sub(old.Name, 1, #slotName) == slotName and tonumber(string.sub(old.Name, #slotName + 1)) ~= nil) then
						old:Destroy()
					end
				end
				for _, m in models do
					m.Parent = folder
				end
			end
		end
	end
	folder:SetAttribute("Report", table.concat(report, "\n"))
	return report
end

return ToolboxLoader
