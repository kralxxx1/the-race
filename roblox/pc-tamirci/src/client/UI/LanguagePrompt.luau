-- LanguagePrompt: the very first time somebody plays, a small window asks for the language
-- (English or Türkçe). It can be changed later at the top of Settings.

local LocalizationService = game:GetService("LocalizationService")

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local App = require(UI.App)
local Prefs = require(UI.Parent.Prefs)

local LanguagePrompt = {}

local root: Frame? = nil

-- The language the account's Roblox language suggests ("tr" for Turkish, otherwise "en").
function LanguagePrompt.suggested(): string
	local ok, id = pcall(function()
		return LocalizationService.RobloxLocaleId
	end)
	if ok and type(id) == "string" and string.sub(string.lower(id), 1, 2) == "tr" then
		return "tr"
	end
	return "en"
end

function LanguagePrompt.isOpen(): boolean
	return root ~= nil and root.Parent ~= nil
end

function LanguagePrompt.close()
	if root then
		root:Destroy()
		root = nil
	end
end

-- onPick(lang) runs after the choice has been made and saved.
function LanguagePrompt.show(onPick: ((string) -> ())?)
	if LanguagePrompt.isOpen() or not App.screen then
		return
	end
	local dim = Kit.frame(App.screen, { Name = "LanguagePrompt", Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.new(0, 0, 0), BackgroundTransparency = 0.35, ZIndex = 50, Active = true })
	root = dim
	local panel = Kit.panel(dim, { Name = "Panel", Size = UDim2.fromOffset(440, 250), Position = UDim2.fromScale(0.5, 0.5), AnchorPoint = Vector2.new(0.5, 0.5), BackgroundColor3 = Theme.panel, ZIndex = 51 })
	Kit.label(panel, "🌐", { Size = UDim2.new(1, 0, 0, 52), Position = UDim2.fromOffset(0, 14), TextSize = 40, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 52 })
	Kit.label(panel, "Choose your language", { Name = "Title", Size = UDim2.new(1, 0, 0, 28), Position = UDim2.fromOffset(0, 70), FontFace = Theme.heavy, TextSize = 22, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 52 })
	Kit.label(panel, "Dilini seç", { Name = "Subtitle", Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 98), TextSize = 16, TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 52 })
	local suggested = LanguagePrompt.suggested()
	for i, l in { { "en", "English" }, { "tr", "Türkçe" } } do
		local b = Kit.button(panel, l[2], function()
			Prefs.setLanguage(l[1])
			LanguagePrompt.close()
			if onPick then
				onPick(l[1])
			end
		end, { Name = "Pick_" .. l[1], Size = UDim2.fromOffset(180, 56), Position = UDim2.new(0.5, if i == 1 then -190 else 10, 0, 140), TextSize = 22, ZIndex = 52 })
		if l[1] ~= suggested then
			Kit.setColor(b, Theme.card)
			b.TextColor3 = Theme.text
		end
	end
	Kit.label(panel, "You can change it later in Settings  •  Daha sonra Ayarlar'dan değiştirebilirsin", { Name = "Hint", Size = UDim2.new(1, -24, 0, 34), Position = UDim2.fromOffset(12, 206), TextSize = 12, TextColor3 = Theme.dim, TextXAlignment = Enum.TextXAlignment.Center, ZIndex = 52 })
end

return LanguagePrompt
