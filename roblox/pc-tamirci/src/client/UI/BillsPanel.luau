-- BillsPanel: the shop's bills (phone ▸ Bills). The week's books on top, unpaid bills with their
-- due dates and late fees (pay one or all), and the last bills paid.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Bills = require(Shared.Data.Bills)
local Upgrades = require(Shared.Data.Upgrades)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local BillsPanel = {}

local function today(): number
	return Workspace:GetAttribute("Day") or 1
end

-- The total due for all unpaid bills today.
function BillsPanel.totalDue(): number
	local b = State.data and State.data.bills
	local sum = 0
	for _, bill in b and b.list or {} do
		sum += Bills.amountDue(bill, today())
	end
	return sum
end

function BillsPanel.render(parent: Instance)
	local head = Kit.frame(parent, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 96) })
	local weekLabel = Kit.label(head, "", { Size = UDim2.new(1, 0, 0, 22), TextSize = 15, FontFace = Theme.bold, TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
	local subLabel = Kit.label(head, "", { Size = UDim2.new(1, 0, 0, 36), Position = UDim2.fromOffset(0, 24), TextSize = 13, TextColor3 = Theme.dim, TextYAlignment = Enum.TextYAlignment.Top })
	local payAll = Kit.button(head, "", function()
		local r = Net.request("bills.pay", { id = "all" })
		if r.ok then
			Hud.toast("🧾 ✔", "good")
		else
			App.report(r)
		end
	end, { Size = UDim2.new(1, 0, 0, 30), Position = UDim2.fromOffset(0, 64), TextSize = 14 }, "primary")
	local list = Kit.list(parent, { Size = UDim2.new(1, 0, 1, -102), Position = UDim2.fromOffset(0, 102) }, 6)

	local function fill()
		Kit.clear(list)
		local d = State.data
		local b = d and d.bills
		if not b then
			return
		end
		local w = b.week or { income = 0, expense = 0 }
		weekLabel.Text = S.t("bills_week", { income = S.money(w.income or 0), expense = S.money(w.expense or 0), profit = S.money((w.income or 0) - (w.expense or 0)) })
		local sub = S.t("bills_hint")
		if b.lastWeek then
			sub = S.t("bills_lastweek", { profit = S.money((b.lastWeek.income or 0) - (b.lastWeek.expense or 0)) }) .. "   •   " .. sub
		end
		subLabel.Text = sub
		local day = today()
		local order = 0
		if b.cut then
			order += 1
			local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 36), BackgroundColor3 = Theme.bad, LayoutOrder = order })
			Kit.label(f, S.t("bills_powercut"), { Size = UDim2.fromScale(1, 1), TextXAlignment = Enum.TextXAlignment.Center, FontFace = Theme.heavy, TextSize = 16 })
		end
		if d.shop and d.shop.items and d.shop.items.autopay then
			order += 1
			Kit.label(list, S.t("bills_auto"), { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.good, TextSize = 13, LayoutOrder = order })
		end
		local unpaid = table.clone(b.list or {})
		table.sort(unpaid, function(x, y)
			return x.due < y.due
		end)
		local total = 0
		for _, bill in unpaid do
			order += 1
			local kind = Bills.kinds[bill.kind] or { icon = "🧾" }
			local amount = Bills.amountDue(bill, day)
			total += amount
			local late = day - bill.due
			local when = if late > 0 then S.t("bills_late", { n = late, pct = math.floor(late * Bills.LateRate * 100) }) elseif late == 0 then S.t("bills_today") else S.t("bills_due", { n = -late })
			local detail = ""
			if bill.kind == "utilities" and bill.detail then
				detail = S.t("bills_detail", { elec = S.money(bill.detail.elec or 0), water = S.money(bill.detail.water or 0), net = S.money(bill.detail.net or 0) }) .. "   •   "
			elseif bill.kind == "tax" and bill.detail then
				detail = S.t("bills_profit", { profit = S.money(bill.detail.profit or 0) }) .. "   •   "
			elseif bill.kind == "inspection" and bill.detail and bill.detail.missing then
				local names = {}
				for _, id in bill.detail.missing do
					local it = Upgrades.get(id)
					table.insert(names, if it then S.pick(it.name) else id)
				end
				detail = S.t("bills_missing", { list = table.concat(names, ", ") }) .. "   •   "
			end
			local _, right = Kit.row(list, kind.icon, S.t("bill_" .. bill.kind), detail .. when, { LayoutOrder = order }, 190)
			Kit.label(right, S.money(amount), { Size = UDim2.fromOffset(84, 36), TextColor3 = if late > 0 then Theme.bad else Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right, LayoutOrder = 1 })
			Kit.button(right, S.t("bills_pay"), function()
				local r = Net.request("bills.pay", { id = bill.id })
				if not r.ok then
					App.report(r)
				end
			end, { Size = UDim2.fromOffset(84, 36), LayoutOrder = 2 }, if late > 0 then "bad" else "primary")
		end
		if #unpaid == 0 then
			order += 1
			Kit.label(list, S.t("bills_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 36), LayoutOrder = order })
		end
		payAll.Visible = #unpaid > 0
		payAll.Text = S.t("bills_payall", { amount = S.money(total) })
		if b.paid and #b.paid > 0 then
			order += 1
			Kit.label(list, "✔ " .. S.t("bills_paid"), { Size = UDim2.new(1, 0, 0, 24), TextColor3 = Theme.dim, FontFace = Theme.bold, TextSize = 14, LayoutOrder = order })
			for _, pb in b.paid do
				order += 1
				local kind = Bills.kinds[pb.kind] or { icon = "🧾" }
				Kit.label(list, kind.icon .. "  " .. S.t("bill_" .. pb.kind) .. "  —  " .. S.money(pb.amount) .. "  (" .. S.t("day", { d = pb.day }) .. ")", { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 13, LayoutOrder = order })
			end
		end
	end
	fill()
	return fill
end

function BillsPanel.open()
	local conn
	local win = Kit.window(App.screen :: ScreenGui, "🧾 " .. S.t("phone_bills"), Vector2.new(700, 560), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local refresh = BillsPanel.render(win.content)
	conn = State.changed:Connect(refresh)
end

return BillsPanel
