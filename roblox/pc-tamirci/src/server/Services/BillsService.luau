-- BillsService: the shop's running costs (Data/Bills). The bills arrive at dawn and are due two
-- mornings later; after that they grow 10 % a day. An electricity bill three days overdue cuts the
-- shop's power (lights out, no powered bench tests, no customers) until it's paid; a tax bill left
-- unpaid turns into a penalty. An accountant on the staff or the bank's auto-pay order pays every
-- bill on the morning it arrives. The service also keeps the week's books (income, spending,
-- wages) that the tax is worked out from.

local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Workspace = game:GetService("Workspace")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Bills = require(Shared.Data.Bills)
local Upgrades = require(Shared.Data.Upgrades)
local Employees = require(Shared.Data.Employees)

local DataService = require(script.Parent.DataService)
local PlotService = require(script.Parent.PlotService)

local BillsService = {}

-- spending that isn't a running cost of the business (and isn't taken off the profit)
local NOT_EXPENSE = { tax = true, fine = true, theft = true }

local function state(p)
	local b = p.bills
	if not b or type(b.list) ~= "table" then
		b = { list = {}, nextId = 0, paid = {}, week = { income = 0, expense = 0, wages = 0 }, lastWeek = nil, mornings = 0, lastDay = 0, cut = false }
		p.bills = b
	end
	b.week = b.week or { income = 0, expense = 0, wages = 0 }
	b.paid = b.paid or {}
	return b
end
BillsService.state = state

-- The owner's auto-pay switch (phone > Bills) decides; until it has been touched the bank's order
-- or an accountant on the staff turn it on by themselves.
local function autopay(p): boolean
	local b = state(p)
	if b.auto ~= nil then
		return b.auto == true
	end
	return (p.shop.items.autopay == true) or Employees.has(p.staff, "accountant")
end
BillsService.autopayOn = autopay

-- Lights in the shop go out while the power is cut (and come back when it's paid).
local function applyPower(player: Player)
	local p = DataService.get(player)
	if not p then
		return
	end
	local cut = state(p).cut == true
	player:SetAttribute("PowerCut", cut)
	local shop = PlotService.shopOf(player)
	if not shop or not shop.model then
		return
	end
	shop.model:SetAttribute("PowerCut", cut)
	for _, d in shop.model:GetDescendants() do
		if d:IsA("Light") then
			if cut then
				if d:GetAttribute("WasOn") == nil then
					d:SetAttribute("WasOn", d.Enabled)
				end
				d.Enabled = false
			elseif d:GetAttribute("WasOn") ~= nil then
				d.Enabled = d:GetAttribute("WasOn") == true
				d:SetAttribute("WasOn", nil)
			end
		end
	end
end
BillsService.applyPower = applyPower

function BillsService.powerCut(player: Player): boolean
	local p = DataService.get(player)
	return p ~= nil and state(p).cut == true
end

local function issue(player: Player, p, kind: string, amount: number, day: number, detail)
	amount = math.floor(amount + 0.5)
	if amount <= 0 then
		return nil
	end
	local b = state(p)
	b.nextId += 1
	local bill = { id = b.nextId, kind = kind, amount = amount, issued = day, due = day + Bills.DueDays, detail = detail }
	table.insert(b.list, bill)
	Net.push(player, "toast", { key = "bill_new", important = true, vars = { kind = kind, amount = amount } })
	return bill
end
BillsService.issue = issue

-- Re-checks the power cut and the tax office after the bills changed.
local function review(player: Player, p, day: number)
	local b = state(p)
	local cut = false
	for _, bill in b.list do
		local late = day - bill.due
		if bill.kind == "utilities" and late >= Bills.CutAfter then
			cut = true
		elseif bill.kind == "tax" and late >= Bills.FineAfter and not bill.fined then
			bill.fined = true
			issue(player, p, "fine", bill.amount * Bills.FineRate, day)
			DataService.rep(player, -3)
		end
	end
	if cut ~= (b.cut == true) then
		b.cut = cut
		Net.push(player, "toast", { key = if cut then "power_cut" else "power_back", important = cut })
	end
	applyPower(player)
end

local HISTORY = 40 -- how many paid bills the books remember

local function pay(player: Player, p, bill, day: number, auto: boolean?): boolean
	local amount = Bills.amountDue(bill, day)
	if not DataService.money(player, -amount, if bill.kind == "tax" or bill.kind == "fine" then bill.kind else "bill") then
		return false
	end
	local b = state(p)
	local i = table.find(b.list, bill)
	if i then
		table.remove(b.list, i)
	end
	-- (the history remembers which bills the bank paid on its own)
	table.insert(b.paid, 1, { kind = bill.kind, amount = amount, day = day, auto = auto == true or nil })
	while #b.paid > HISTORY do
		table.remove(b.paid)
	end
	return true
end

local function today(): number
	return Workspace:GetAttribute("Day") or 1
end

-- Every morning the unpaid bills nag: the ones that fall due tomorrow, the ones that are late (and
-- growing), and the electricity about to be cut. (One message for each, however many bills.)
local function remind(player: Player, p, day: number, quiet: boolean?)
	local b = state(p)
	local soon, late = { n = 0, total = 0 }, { n = 0, total = 0 }
	local cutTomorrow = false
	for _, bill in b.list do
		local left = bill.due - day
		if left == 1 then
			soon.n += 1
			soon.total += Bills.amountDue(bill, day)
		elseif left < 0 then
			late.n += 1
			late.total += Bills.amountDue(bill, day)
		end
		if bill.kind == "utilities" and day - bill.due == Bills.CutAfter - 1 then
			cutTomorrow = true
		end
	end
	-- (when the auto-pay order has just failed it has said so: not a second message about the same bills)
	if soon.n > 0 and not quiet then
		Net.push(player, "toast", { key = "bills_due_soon", important = true, vars = { n = soon.n, amount = soon.total } })
	end
	if late.n > 0 and not quiet then
		Net.push(player, "toast", { key = "bills_overdue", important = true, vars = { n = late.n, amount = late.total } })
	end
	if cutTomorrow then
		Net.push(player, "toast", { key = "power_cut_soon", important = true })
	end
end
BillsService._remind = remind

-- Pays one bill (id) or all of them ("all"); returns how many were paid.
function BillsService.pay(player: Player, which: any): (number, string?)
	local p = DataService.get(player)
	if not p then
		return 0, "no_profile"
	end
	local b = state(p)
	local day = today()
	local n = 0
	local list = table.clone(b.list)
	-- the oldest first: the power and the tax office come before the newest bill
	table.sort(list, function(x, y)
		return x.due < y.due
	end)
	for _, bill in list do
		if which == "all" or bill.id == which then
			if pay(player, p, bill, day) then
				n += 1
			elseif which ~= "all" then
				return 0, "money"
			end
		end
	end
	if n > 0 then
		review(player, p, day)
		DataService.touch(player)
	end
	return n, if n == 0 then "money" else nil
end

-- The auto-pay order: pays what the till can afford, the most urgent bill first, writes each into the
-- history and tells the owner how it went (what was paid, what could not be). Returns paid, failed.
function BillsService.autoPay(player: Player, p, day: number): (number, number)
	local b = state(p)
	if #b.list == 0 then
		return 0, 0
	end
	local list = table.clone(b.list)
	table.sort(list, function(x, y)
		return x.due < y.due
	end)
	local paid, paidTotal, failed, failedTotal = 0, 0, 0, 0
	for _, bill in list do
		local amount = Bills.amountDue(bill, day)
		if pay(player, p, bill, day, true) then
			paid += 1
			paidTotal += amount
		else
			failed += 1
			failedTotal += amount
		end
	end
	if paid > 0 then
		Net.push(player, "toast", { key = "bills_autopaid", important = true, vars = { n = paid, amount = paidTotal } })
		DataService.touch(player)
	end
	if failed > 0 then
		Net.push(player, "toast", { key = "bills_autofail", important = true, vars = { n = failed, amount = failedTotal } })
	end
	return paid, failed
end

-- One morning for one shop: yesterday's utilities, the week's rent / SGK / tax every seventh
-- morning, late fees and power, auto-pay.
function BillsService.morning(player: Player, p, day: number)
	local b = state(p)
	if b.lastDay == day then
		return
	end
	b.lastDay = day
	b.mornings = (b.mornings or 0) + 1
	local lvl = Upgrades.level(p.shop.level)
	local u = Bills.utilities(p.shop.level, lvl.benches, p.shop.items, p.factory and p.factory.elec or 0)
	if Employees.has(p.staff, "network_tech") then
		-- (the network technician runs the line for free)
		u.total -= u.net
		u.net = 0
	end
	issue(player, p, "utilities", u.total, day, { elec = u.elec, water = u.water, net = u.net })
	if b.mornings >= Bills.Week then
		b.mornings = 0
		issue(player, p, "rent", Bills.rent(p.shop.level), day)
		if p.shop.items.insurance then
			issue(player, p, "insurance", Bills.InsurancePerLevel * p.shop.level, day)
		end
		if b.week.wages > 0 then
			issue(player, p, "sgk", b.week.wages * Bills.SgkRate, day)
		end
		local profit = b.week.income - b.week.expense
		if profit > 0 then
			local relief = math.clamp(Upgrades.total(p.shop.items, "taxRelief") + (if Employees.has(p.staff, "accountant") then 0.25 else 0), 0, 0.6)
			issue(player, p, "tax", profit * Bills.TaxRate * (1 - relief), day, { profit = math.floor(profit) })
		end
		b.lastWeek = b.week
		b.week = { income = 0, expense = 0, wages = 0 }
		-- the municipal inspection: a fine for every licence or safety item missing
		local missing = Bills.missing(p.shop.level, p.shop.items)
		if #missing > 0 then
			issue(player, p, "inspection", Bills.InspectionFine * p.shop.level * #missing, day, { missing = missing })
			Net.push(player, "toast", { key = "inspection_fail", important = true, vars = { n = #missing } })
		elseif p.shop.level >= 2 then
			Net.push(player, "toast", { key = "inspection_ok" })
		end
	end
	-- the shop's good name grows a little every day (reviews, a website people find...)
	local rep = Upgrades.total(p.shop.items, "rep")
	if rep > 0 then
		DataService.rep(player, rep)
	end
	local failed = 0
	if autopay(p) then
		local _, notPaid = BillsService.autoPay(player, p, day)
		failed = notPaid
	end
	review(player, p, day)
	remind(player, p, day, failed > 0)
	DataService.touch(player)
end

function BillsService.newDay(day: number)
	for player, p in DataService.all() do
		if p.opened ~= false and PlotService.shopOf(player) then
			BillsService.morning(player, p, day)
		end
	end
end

function BillsService.init() end

function BillsService.start()
	-- the books: income and spending of the week
	DataService.earned:Connect(function(player, amount, reason)
		local p = DataService.get(player)
		if p and reason ~= "recovered" then
			state(p).week.income += amount
		end
	end)
	DataService.spent:Connect(function(player, amount, reason)
		local p = DataService.get(player)
		if not p or NOT_EXPENSE[reason or ""] then
			return
		end
		local w = state(p).week
		w.expense += amount
		if reason == "wages" then
			w.wages += amount
		end
	end)
	-- a player who comes back after days away starts with today (no backlog of bills)
	DataService.loaded:Connect(function(player, p)
		local b = state(p)
		if b.lastDay ~= 0 and today() - b.lastDay > 1 then
			b.lastDay = today() - 1
		end
		applyPower(player)
	end)
	PlotService.built:Connect(function(player)
		task.defer(applyPower, player)
	end)
	-- the owner's auto-pay switch
	Net.handle("bills.auto", function(player, payload)
		if not Net.V.tbl(payload) or not Net.V.bool(payload.on) then
			return { ok = false, err = "bad_request" }
		end
		local p = DataService.get(player)
		if not p then
			return { ok = false, err = "no_profile" }
		end
		state(p).auto = payload.on
		DataService.touch(player)
		return { ok = true, on = payload.on }
	end)
	Net.handle("bills.pay", function(player, payload)
		if not Net.V.tbl(payload) or not (payload.id == "all" or Net.V.int(payload.id, 1, 1e9)) then
			return { ok = false, err = "bad_request" }
		end
		local n, err = BillsService.pay(player, payload.id)
		if n == 0 then
			return { ok = false, err = err or "money" }
		end
		return { ok = true, paid = n }
	end)
end

return BillsService
