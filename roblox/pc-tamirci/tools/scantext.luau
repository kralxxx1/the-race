-- Finds text a player could read that is not English: the baked world text (signs, prompts) and
-- the text of every UI scene (see tools/uidump.luau scenes). Prints each distinct line once.
--   lune run tools/scantext.luau world
--   lune run tools/scantext.luau ui <scene>

local Engine = require("../tests/lib/Engine")
local process = require("@lune/process")
local what = process.args[1] or "world"

require("../tests/lib/Bootstrap").run("tools/scantext.luau")
Engine.context = "server"
Engine.load("build/PCTamirci.rbxlx")

local TURKISH_CHARS = { "ç", "ğ", "ı", "ö", "ş", "ü", "Ç", "Ğ", "İ", "Ö", "Ş", "Ü", "â", "î", "û" }
local TURKISH_WORDS = {
	"kule", "merkez", "han ", "ofis", "dükkan", "tamir", "bilgisayar", "satış", "pazar", "çarşı", "sokak", "caddesi",
	"bulvar", "otel", "kafe", "lokanta", "market", "eczane", "kuaför", "berber", "fırın", "büfe", "hurda", "yeni ",
	"hoş geldin", "açık", "kapalı", "indirim", "ucuz", "kasa", "güç", "teknik", "üniversite", "belediye", "hastane",
	"itfaiye", "polis", "kütüphane", "okul", "liman", "plaj", "deniz", "sahil", "balık", "dondurma", "pizza",
}

local function suspicious(text: string): boolean
	if string.find(text, "^%s*$") then
		return false
	end
	for _, c in TURKISH_CHARS do
		if string.find(text, c, 1, true) then
			return true
		end
	end
	local low = string.lower(text)
	for _, w in TURKISH_WORDS do
		if string.find(low, w, 1, true) then
			return true
		end
	end
	return false
end

local seen, count = {}, 0
local function report(where: string, text: string)
	if suspicious(text) and not seen[text] then
		seen[text] = true
		count += 1
		print(string.format("%-28s %s", where, (string.gsub(text, "\n", " ⏎ "))))
	end
end

local function scan(root, tag: string)
	for _, d in root:GetDescendants() do
		if d:IsA("TextLabel") or d:IsA("TextButton") or d:IsA("TextBox") then
			report(tag .. "/" .. d.ClassName, d.Text)
		elseif d:IsA("ProximityPrompt") then
			report(tag .. "/Prompt", d.ActionText .. " | " .. d.ObjectText)
		elseif d:IsA("Tool") then
			report(tag .. "/Tool", d.Name .. " " .. (d.ToolTip or ""))
		end
	end
end

if what == "world" then
	local WorldBuilder = Engine.mod("ServerScriptService.Server.World.WorldBuilder")
	local world = WorldBuilder.build({ bake = true })
	scan(world, "world")
	local Buildings = Engine.mod("ReplicatedStorage.Shared.Models.Buildings")
	for _, n in Buildings.ShopNames do
		report("shop names", n)
	end
end
print("suspicious lines: " .. count)
