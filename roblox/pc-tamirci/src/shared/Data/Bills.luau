-- Bills: what running the shop costs. Every morning the utility bill for the day before
-- (electricity for the lights, benches and equipment; water; internet); every seventh morning the
-- rent, the staff's insurance and the income tax on the week's profit.

local Upgrades = require(script.Parent.Upgrades)

local Bills = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Bills.kinds = {
	utilities = { icon = "⚡", name = N("Elektrik • Su • İnternet", "Electricity • Water • Internet") },
	rent = { icon = "🏠", name = N("Dükkân Kirası", "Shop Rent") },
	sgk = { icon = "🧾", name = N("Personel Sigorta Primleri", "Staff Insurance") },
	tax = { icon = "🏛️", name = N("Gelir Vergisi", "Income Tax") },
	fine = { icon = "⚠️", name = N("Vergi Cezası", "Tax Penalty") },
	insurance = { icon = "📄", name = N("Sigorta Primi", "Insurance Premium") },
	inspection = { icon = "👮", name = N("Zabıta Cezası", "Municipal Inspection Fine") },
}

Bills.DueDays = 2 -- mornings to pay before it is late
Bills.LateRate = 0.1 -- added for every day a bill is overdue
Bills.CutAfter = 3 -- days an electricity bill can be overdue before the power is cut
Bills.FineAfter = 3 -- days a tax bill can be overdue before the tax office fines you
Bills.FineRate = 0.25
Bills.Week = 7 -- mornings between rent and tax
Bills.TaxRate = 0.15 -- of the week's profit
Bills.SgkRate = 0.2 -- of the week's wages
Bills.Rent = { 250, 450, 900, 1800, 4000, 9000 } -- per week, by shop level
Bills.ElecBase = { 12, 20, 35, 55, 85, 130 } -- lights, till, router... per day
Bills.WaterBase = { 4, 6, 9, 12, 16, 22 }
Bills.Internet = 8
Bills.InsurancePerLevel = 60 -- weekly premium for each shop level
Bills.ElecPerBench = 6
Bills.InspectionFine = 120 -- for each missing item, times the shop level

-- One day's utility bill for a shop: { elec, water, net, total }. Powered upgrades add to the
-- electricity (field elec), energy upgrades take a share off it (elecSave).
function Bills.utilities(level: number, benches: number, items: { [string]: boolean }?, extraElec: number?)
	local l = math.clamp(level, 1, #Bills.Rent)
	local elec = Bills.ElecBase[l] + benches * Bills.ElecPerBench + Upgrades.total(items, "elec") + (extraElec or 0)
	local save = math.clamp(Upgrades.total(items, "elecSave"), 0, 0.8)
	elec = math.floor(elec * (1 - save) + 0.5)
	local water = math.max(1, Bills.WaterBase[l] + Upgrades.total(items, "water"))
	local net = math.max(0, Bills.Internet + Upgrades.total(items, "net"))
	return { elec = elec, water = water, net = net, total = elec + water + net }
end

-- What the municipal inspection would find missing in a shop of this level.
function Bills.missing(level: number, items: { [string]: boolean }?): { string }
	local out = {}
	for _, it in Upgrades.items do
		if it.required and level >= it.required and not (items and items[it.id]) then
			table.insert(out, it.id)
		end
	end
	return out
end

function Bills.rent(level: number): number
	return Bills.Rent[math.clamp(level, 1, #Bills.Rent)]
end

-- What a bill costs on `day`, late fees included.
function Bills.amountDue(bill, day: number): number
	local late = math.max(0, day - bill.due)
	return math.floor(bill.amount * (1 + late * Bills.LateRate) + 0.5)
end

return Bills
