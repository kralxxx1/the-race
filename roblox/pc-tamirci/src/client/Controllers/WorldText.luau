-- WorldText: the words built into the world (shop signs, boards, street signs, interaction prompts)
-- are English. In Turkish they are swapped for the Turkish text (Util/SignText) and swapped back
-- when the language changes again. English costs nothing: it is the original text.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local SignText = require(Shared.Util.SignText)

local S = require(script.Parent.Parent.Strings)

local WorldText = {}

local TEXT_PROPS = { "Text" }
local PROMPT_PROPS = { "ActionText", "ObjectText" }

-- what each changed thing said before: { orig = { [prop] = english }, now = { [prop] = turkish } }
local records: { [Instance]: { orig: { [string]: string }, now: { [string]: string } } } = setmetatable({}, { __mode = "k" })
local watched: { [Instance]: boolean } = setmetatable({}, { __mode = "k" })
local scanId = 0

local function propsOf(inst: Instance): { string }?
	if inst:IsA("TextLabel") or inst:IsA("TextButton") then
		return TEXT_PROPS
	elseif inst:IsA("ProximityPrompt") then
		return PROMPT_PROPS
	end
	return nil
end

local apply

-- the server may change a sign's text later (a shop's name, a ticket number): translate it again
local function watch(inst: Instance, names: { string })
	if watched[inst] then
		return
	end
	watched[inst] = true
	for _, p in names do
		inst:GetPropertyChangedSignal(p):Connect(function()
			if S.lang() == "tr" then
				apply(inst)
			end
		end)
	end
end

function apply(inst: Instance)
	local names = propsOf(inst)
	if not names then
		return
	end
	local rec = records[inst]
	for _, prop in names do
		local cur = (inst :: any)[prop]
		if type(cur) == "string" and cur ~= "" and not (rec and rec.now[prop] == cur) then
			local tr = SignText.turkish(cur)
			if tr then
				if not rec then
					rec = { orig = {}, now = {} }
					records[inst] = rec
				end
				rec.orig[prop] = cur
				rec.now[prop] = tr
				;(inst :: any)[prop] = tr
				watch(inst, names)
			elseif rec then
				-- new text without a translation: do not put old text back later
				rec.orig[prop] = nil
				rec.now[prop] = nil
			end
		end
	end
end

local function revert()
	scanId += 1
	for inst, rec in records do
		for prop, orig in rec.orig do
			if rec.now[prop] ~= nil and (inst :: any)[prop] == rec.now[prop] then
				(inst :: any)[prop] = orig
			end
		end
		records[inst] = nil
	end
end

-- Goes over everything in the world (in slices, so the frame rate does not notice).
local function scan()
	scanId += 1
	local id = scanId
	task.spawn(function()
		local n = 0
		for _, d in Workspace:GetDescendants() do
			if id ~= scanId then
				return
			end
			if propsOf(d) then
				pcall(apply, d) -- (something may have been removed while the scan took a break)
			end
			n += 1
			if n % 2500 == 0 then
				task.wait()
			end
		end
	end)
end

-- Call when the language is set or changed.
function WorldText.setLanguage(lang: string)
	if lang == "tr" then
		scan()
	else
		revert()
	end
end

function WorldText.init()
	Workspace.DescendantAdded:Connect(function(d)
		if S.lang() ~= "tr" then
			return
		end
		local names = propsOf(d)
		if names then
			apply(d)
			-- (built empty and filled in afterwards)
			watch(d, names)
		end
	end)
	WorldText.setLanguage(S.lang())
end

return WorldText
