-- Employees: roles you can hire, their traits and how candidates are generated.

local Rand = require(script.Parent.Parent.Util.Rand)
local Customers = require(script.Parent.Customers)

local Employees = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Employees.roles = {
	technician = {
		id = "technician", icon = "🧑‍🔧", wage = 120, max = 8, minShop = 1,
		name = N("Teknisyen", "Technician"),
		desc = N("Boş bir tezgâhta sıradaki işi kendisi onarır. Parçaları envanterden kullanır.", "Repairs queued jobs at a free bench using parts from your inventory."),
	},
	receptionist = {
		id = "receptionist", icon = "🧑‍💼", wage = 90, max = 1, minShop = 2,
		name = N("Resepsiyonist", "Receptionist"),
		desc = N("Sen meşgulken müşteriyle konuşur, iş kabul eder ve teslim eder.", "Talks to customers, accepts and delivers jobs while you're busy."),
	},
	manager = {
		id = "manager", icon = "👔", wage = 260, max = 1, minShop = 3,
		name = N("Müdür", "Manager"),
		desc = N("Eksik parçaları otomatik sipariş eder, çalışanları hızlandırır, sen yokken dükkânı işletir.", "Auto-orders missing parts, boosts staff and runs the shop while you're away."),
	},
	security = {
		id = "security", icon = "💂", wage = 110, max = 2, minShop = 2,
		name = N("Güvenlik Görevlisi", "Security Guard"),
		desc = N("Hırsızları kovalar ve yakalar.", "Chases and catches thieves."),
	},
	cleaner = {
		id = "cleaner", icon = "🧹", wage = 70, max = 1, minShop = 2,
		name = N("Temizlikçi", "Cleaner"),
		desc = N("Dükkânı temiz tutar; müşteriler daha mutlu olur.", "Keeps the shop clean; customers are happier."),
	},
}
Employees.roleOrder = { "technician", "receptionist", "manager", "security", "cleaner" }

Employees.traits = {
	{ id = "fast", name = N("Hızlı", "Fast"), speed = 0.2, wage = 0.1 },
	{ id = "careful", name = N("Dikkatli", "Careful"), success = 0.12, wage = 0.08 },
	{ id = "tea", name = N("Çaycı", "Tea Maker"), comfort = 6 },
	{ id = "chatty", name = N("Konuşkan", "Chatty"), tips = 0.1 },
	{ id = "lazy", name = N("Tembel", "Lazy"), speed = -0.25, wage = -0.2 },
	{ id = "night", name = N("Gece Kuşu", "Night Owl"), nightSpeed = 0.3 },
	{ id = "strong", name = N("Kuvvetli", "Strong"), catch = 0.25 },
	{ id = "veteran", name = N("Tecrübeli", "Veteran"), speed = 0.1, success = 0.1, wage = 0.3 },
	{ id = "rookie", name = N("Acemi", "Rookie"), success = -0.12, wage = -0.25 },
	{ id = "polyglot", name = N("Yabancı Dil Bilir", "Multilingual"), tips = 0.08, comfort = 2 },
	{ id = "tidy", name = N("Titiz", "Tidy"), comfort = 4, success = 0.04 },
	{ id = "clumsy", name = N("Sakar", "Clumsy"), success = -0.08, speed = 0.05, wage = -0.15 },
}
Employees.traitById = {}
for _, t in Employees.traits do
	Employees.traitById[t.id] = t
end

-- Candidates for a player on a given in-game day (same list until the day changes or they refresh).
function Employees.candidates(seed: number, count: number?): { { [string]: any } }
	local rng = Rand.new(seed)
	local out = {}
	for i = 1, count or 6 do
		local roleId = Employees.roleOrder[((i - 1) % #Employees.roleOrder) + 1]
		if i > #Employees.roleOrder then
			roleId = Rand.pick(rng, { "technician", "technician", "security", "receptionist" })
		end
		local role = Employees.roles[roleId]
		local name, gender = Customers.randomName(rng, false)
		local skill = rng:NextInteger(1, 5)
		local trait = Rand.pick(rng, Employees.traits)
		local wage = math.floor(role.wage * (0.7 + skill * 0.15) * (1 + (trait.wage or 0)) / 5 + 0.5) * 5
		table.insert(out, {
			uid = string.format("c%d_%d", seed % 100000, i),
			role = roleId,
			name = name,
			gender = gender,
			skill = skill,
			trait = trait.id,
			wage = wage,
			hireCost = wage * 2,
			look = rng:NextInteger(1, 1e6),
		})
	end
	return out
end

-- Efficiency multiplier for a hired employee record.
function Employees.speed(e): number
	local t = Employees.traitById[e.trait]
	return (0.6 + e.skill * 0.12) * (1 + (t and t.speed or 0))
end

function Employees.success(e): number
	local t = Employees.traitById[e.trait]
	return math.clamp(0.72 + e.skill * 0.05 + (t and t.success or 0), 0.4, 0.99)
end

return Employees
