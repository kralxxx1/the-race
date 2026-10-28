-- QuestService: three daily tasks per player (Data/Quests). Other services report progress with
-- QuestService.bump(player, kind, amount); income counts through DataService.earned. Finished
-- tasks are claimed from the city hall board or the phone.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Quests = require(Shared.Data.Quests)
local Market = require(Shared.Economy.Market)
local Rand = require(Shared.Util.Rand)

local DataService = require(script.Parent.DataService)

local QuestService = {}

local V = Net.V

-- income that counts towards "earn"
local EARNING = { repair = true, contract = true, showcase = true, resale = true, sell = true, bounty = true, tip = true }

-- Today's three tasks for the player (made on first use each day).
function QuestService.ensure(player: Player)
	local p = DataService.get(player)
	if not p then
		return nil
	end
	local day = Market.day()
	if p.quests and p.quests.day == day and #p.quests.list > 0 then
		return p.quests
	end
	local rng = Rand.new(day * 7919 + player.UserId % 100003)
	local pool = {}
	for _, q in Quests.list do
		if (q.level or 1) <= p.level then
			table.insert(pool, q)
		end
	end
	Rand.shuffle(rng, pool)
	local scale = Quests.scale(p.level)
	local list = {}
	for i = 1, math.min(3, #pool) do
		local q = pool[i]
		local goal = rng:NextInteger(q.goal[1], q.goal[2])
		if q.money then
			goal = math.floor(goal * scale / 50 + 0.5) * 50
		end
		table.insert(list, { id = q.id, goal = goal, n = 0, claimed = false, reward = math.floor(q.reward * scale), xp = q.xp })
	end
	p.quests = { day = day, list = list }
	DataService.touch(player)
	return p.quests
end

function QuestService.bump(player: Player, kind: string, amount: number?)
	local qs = QuestService.ensure(player)
	if not qs then
		return
	end
	local changed = false
	for _, q in qs.list do
		if q.id == kind and q.n < q.goal then
			q.n = math.min(q.goal, q.n + (amount or 1))
			changed = true
			if q.n >= q.goal then
				Net.push(player, "toast", { key = "quest_done", vars = { reward = q.reward } })
			end
		end
	end
	if changed then
		DataService.touch(player)
	end
end

local function claim(player: Player, payload)
	if not V.tbl(payload) or not V.int(payload.i, 1, 3) then
		return { ok = false, err = "bad" }
	end
	local qs = QuestService.ensure(player)
	local q = qs and qs.list[payload.i]
	if not q or q.claimed or q.n < q.goal then
		return { ok = false, err = "not_done" }
	end
	q.claimed = true
	DataService.money(player, q.reward, "quest")
	DataService.addXp(player, q.xp)
	DataService.touch(player)
	return { ok = true, reward = q.reward }
end

function QuestService.init() end

function QuestService.start()
	Net.handle("quests.claim", claim)
	DataService.loaded:Connect(function(player)
		QuestService.ensure(player)
	end)
	DataService.earned:Connect(function(player, delta, reason)
		if EARNING[reason or ""] then
			QuestService.bump(player, "earn", math.floor(delta))
		end
	end)
end

return QuestService
