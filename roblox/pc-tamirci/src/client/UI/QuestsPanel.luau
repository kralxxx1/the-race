-- QuestsPanel: today's three tasks with progress and rewards (city hall board and phone).

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Quests = require(Shared.Data.Quests)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local QuestsPanel = {}

-- Fills `parent` with the task list; returns a function that refreshes it.
function QuestsPanel.render(parent: Instance)
	local list = Kit.list(parent, { Size = UDim2.new(1, 0, 1, -24) }, 8)
	Kit.label(parent, S.t("quest_new"), { Size = UDim2.new(1, 0, 0, 20), Position = UDim2.new(0, 0, 1, -20), TextColor3 = Theme.dim, TextSize = 13 })
	local function fill()
		Kit.clear(list)
		local qs = State.data and State.data.quests
		for i, q in qs and qs.list or {} do
			local def = Quests.get(q.id)
			if def then
				local goalText = if def.money then S.money(q.goal) else tostring(q.goal)
				local progress = if def.money then S.money(q.n) .. " / " .. S.money(q.goal) else q.n .. " / " .. q.goal
				local title = string.gsub(S.pick(def.name), "{n}", goalText)
				local f, right = Kit.row(list, def.icon, title, progress .. "   •   " .. S.t("quest_reward", { reward = S.money(q.reward), xp = q.xp }), { LayoutOrder = i, Size = UDim2.new(1, 0, 0, 66) }, 150)
				local bar = Kit.progress(f, { Size = UDim2.new(1, -236, 0, 5), Position = UDim2.fromOffset(58, 54) }, if q.n >= q.goal then Theme.good else Theme.accent)
				bar:set(q.n / math.max(1, q.goal))
				if q.claimed then
					Kit.pill(right, "✔ " .. S.t("quest_claimed"), Theme.good)
				elseif q.n >= q.goal then
					Kit.button(right, "🎁 " .. S.t("quest_claim"), function()
						local r = Net.request("quests.claim", { i = i })
						if r.ok then
							Hud.toast("🎁 +" .. S.money(r.reward or q.reward), "good")
						else
							App.report(r)
						end
					end, { Size = UDim2.fromOffset(140, 38) }, "good")
				else
					Kit.pill(right, math.floor(q.n / math.max(1, q.goal) * 100) .. "%", Theme.card)
				end
			end
		end
		if not qs or #qs.list == 0 then
			Kit.label(list, S.t("empty"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
		end
	end
	fill()
	return fill
end

function QuestsPanel.open()
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "📜 " .. S.t("quests_title"), Vector2.new(720, 420), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local refresh = QuestsPanel.render(win.content)
	conn = State.changed:Connect(refresh)
end

return QuestsPanel
