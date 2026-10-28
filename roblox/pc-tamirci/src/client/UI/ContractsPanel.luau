-- ContractsPanel: bulk work offered by the internet café and the data centre.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)

local ContractsPanel = {}

local KIND_ICON = { maintenance = "🧹", repair = "🔧", upgrade_ssd = "💽", upgrade_ram = "📏" }

function ContractsPanel.open(o)
	local win = Kit.window(App.screen :: ScreenGui, "🏢 " .. S.pick(o.name) .. " — " .. S.t("contracts_title"), Vector2.new(760, 500), function()
		task.spawn(Net.request, "market.close")
	end)
	local c = win.content
	local head = if o.active then S.t("contract_active", { title = S.pick(o.active.title), done = o.active.done, total = o.active.total }) else S.t("contract_hint")
	Kit.label(c, head, { Size = UDim2.new(1, 0, 0, 40), TextColor3 = if o.active then Theme.warn else Theme.dim, TextSize = 14, TextYAlignment = Enum.TextYAlignment.Top })
	if o.locked then
		local why = if o.why == "level" then S.t("needs_level", { n = o.level }) else S.err(o.why)
		Kit.label(c, "🔒 " .. why, { Size = UDim2.new(1, 0, 0, 24), Position = UDim2.fromOffset(0, 40), TextColor3 = Theme.bad, FontFace = Theme.bold })
	end
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -72), Position = UDim2.fromOffset(0, 70) }, 8)
	for i, offer in o.offers or {} do
		local sub = S.t("contract_count", { n = offer.count }) .. "  •  " .. S.t("contract_pay", { pay = S.money(offer.pay), bonus = S.money(offer.bonus) })
		local _, right = Kit.row(list, KIND_ICON[offer.kind] or "🏢", S.pick(offer.title), sub, { LayoutOrder = i })
		Kit.label(right, S.money(offer.pay * offer.count + offer.bonus), { Size = UDim2.fromOffset(80, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
		local b = Kit.button(right, S.t("contract_accept"), function()
			local r = Net.request("contracts.accept", { poi = o.poi, key = offer.key })
			if r.ok then
				win.close()
				Hud.toast(S.t("contract_taken", { n = r.count or offer.count }), "good", 6)
			else
				App.report(r)
			end
		end, { Size = UDim2.fromOffset(130, 36), TextSize = 15 }, "good")
		Kit.setEnabled(b, not o.locked and o.active == nil)
	end
end

function ContractsPanel.init()
	Net.on("contracts.open", ContractsPanel.open)
end

return ContractsPanel
