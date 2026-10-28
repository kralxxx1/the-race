-- Quests: the daily tasks on the city hall board. Every player gets three a day (the same three
-- all day, new ones at midnight UTC); {n} in the name is the goal.

local Quests = {}

local function N(tr, en)
	return { tr = tr, en = en }
end

Quests.list = {
	{ id = "deliver", icon = "🔧", goal = { 2, 4 }, reward = 140, xp = 40, name = N("Müşteriye {n} onarılmış cihaz teslim et", "Deliver {n} repaired devices") },
	{ id = "perfect", icon = "⭐", goal = { 1, 2 }, reward = 180, xp = 50, name = N("Müşterilerden {n} kez 5 yıldız al", "Get {n} five-star reviews") },
	{ id = "sell", icon = "♻️", goal = { 2, 4 }, reward = 90, xp = 25, name = N("2. el pazarına ya da hurdalığa {n} parça sat", "Sell {n} parts to a dealer") },
	{ id = "buy", icon = "🛒", goal = { 2, 5 }, reward = 80, xp = 20, name = N("Parçacılardan {n} parça al", "Buy {n} parts") },
	{ id = "junk", icon = "🏗️", goal = { 1, 1 }, reward = 120, xp = 30, level = 2, name = N("Hurdalıktan bir hurda kasa al", "Buy a junk PC at the scrapyard") },
	{ id = "catch", icon = "🚨", goal = { 1, 1 }, reward = 200, xp = 60, level = 2, name = N("Bir hırsız ya da dolandırıcı yakala", "Catch a thief or a scammer") },
	{ id = "taxi", icon = "🚕", goal = { 1, 2 }, reward = 60, xp = 15, name = N("{n} kez taksiye bin", "Take {n} taxi rides") },
	{ id = "contract", icon = "🏢", goal = { 2, 3 }, reward = 220, xp = 60, level = 3, name = N("{n} sözleşme makinesini sorunsuz teslim et", "Deliver {n} working contract machines") },
	{ id = "earn", icon = "💰", goal = { 300, 900 }, reward = 150, xp = 40, money = true, name = N("Bugün {n} kazan", "Earn {n} today") },
}

Quests.byId = {}
for _, q in Quests.list do
	Quests.byId[q.id] = q
end

function Quests.get(id: string)
	return Quests.byId[id]
end

-- Rewards grow with the player's level.
function Quests.scale(level: number): number
	return 1 + math.max(0, level - 1) * 0.08
end

return Quests
