-- LeadersPanel: the leaderboards (LeaderService). One tab per table on this server, plus the
-- all-time net worth across every server. Shown at the city hall board and from the phone.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local App = require(UI.App)
local S = require(UI.Parent.Strings)

local LeadersPanel = {}

local TABS = {
	{ id = "worth", icon = "🏢" },
	{ id = "money", icon = "💰" },
	{ id = "repairs", icon = "🔧" },
	{ id = "level", icon = "⭐" },
	{ id = "rep", icon = "👍" },
	{ id = "caught", icon = "🚨" },
	{ id = "made", icon = "🏭" },
	{ id = "global", icon = "🌍" },
}

local function valueText(kind: string, row): string
	if kind == "money" or kind == "worth" or kind == "global" then
		return S.money(row.score or 0)
	elseif kind == "level" then
		return S.t("level") .. " " .. tostring(row.level or math.floor((row.score or 0) / 100000))
	elseif kind == "repairs" then
		return S.t("stat_repairs", { n = row.score or 0 })
	end
	return tostring(row.score or 0)
end

-- Fills `parent` with the tabs and the tables in `data` ({ categories, global }).
function LeadersPanel.render(parent: Instance, data)
	local list = Kit.list(parent, { Size = UDim2.new(1, 0, 1, -76), Position = UDim2.fromOffset(0, 76) }, 6)
	local hint = Kit.label(parent, "", { Size = UDim2.new(1, 0, 0, 22), Position = UDim2.fromOffset(0, 46), TextColor3 = Theme.dim, TextSize = 13 })
	local tabs = {}
	for _, t in TABS do
		table.insert(tabs, { id = t.id, text = t.icon .. " " .. S.t("lead_" .. t.id) })
	end
	local bar = Kit.tabs(parent, tabs, function(id)
		Kit.clear(list)
		hint.Text = S.t("lead_hint_" .. id)
		local rows = if id == "global" then data.global or {} else (data.categories or {})[id] or {}
		local me = Players.LocalPlayer
		for i, row in rows do
			local medal = if i == 1 then "🥇" elseif i == 2 then "🥈" elseif i == 3 then "🥉" else "#" .. i
			local mine = me ~= nil and row.userId == me.UserId
			local sub = if id == "global" then S.t("lead_alltime") else S.t("level") .. " " .. tostring(row.level or 1) .. "  •  " .. S.t("lead_worth_short", { worth = S.money(row.worth or 0) })
			local f, right = Kit.row(list, medal, row.name .. (if mine then " " .. S.t("board_you") else ""), sub, { LayoutOrder = i }, 200)
			if mine then
				Kit.outline(f, Theme.accent, 2, 0)
			end
			Kit.label(right, valueText(id, row), { Size = UDim2.fromOffset(190, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
		end
		if #rows == 0 then
			Kit.label(list, S.t(if id == "global" then "lead_global_none" else "lead_none"), { Size = UDim2.new(1, 0, 0, 40), TextColor3 = Theme.dim })
		end
	end)
	for _, b in bar.buttons do
		b.TextSize = 13
	end
	bar.select("worth")
end

-- From the phone: fetch the tables and show them.
function LeadersPanel.open()
	local r = Net.request("leaders.get")
	if not r.ok then
		App.report(r)
		return
	end
	local win = Kit.window(App.screen :: ScreenGui, "🏆 " .. S.t("board_leaders"), Vector2.new(900, 580))
	LeadersPanel.render(win.content, r.data or {})
end

return LeadersPanel
