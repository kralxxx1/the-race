-- FactoryPanel: your factory at the industrial estate (Data/Factory). Production lines with their
-- progress on the left; on the right what the factory can make and what's in its warehouse (ship
-- to the shop or sell to distributors). Buying and upgrading the factory sit in the header.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Parts = require(Shared.Data.Parts)
local Factory = require(Shared.Data.Factory)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local FactoryPanel = {}

-- The factory runs on the server's clock: the offset is fetched when the panel opens.
local offset = 0
local function now(): number
	return os.clock() + offset
end
local function syncClock()
	local r = Net.request("factory.time")
	if r.ok and type(r.t) == "number" then
		offset = r.t - os.clock()
	end
end

local function partName(id: string): string
	local p = Parts.get(id)
	return if p then p.name else id
end

local function icon(id: string): string
	local p = Parts.get(id)
	return p and Theme.catIcon[p.cat] or "📦"
end

function FactoryPanel.open()
	syncClock()
	local conns = {}
	local alive = true
	local win = Kit.window(App.screen :: ScreenGui, "🏭 " .. S.t("factory"), Vector2.new(1040, 620), function()
		alive = false
		for _, c in conns do
			c:Disconnect()
		end
	end)
	local c = win.content
	local info = Kit.label(c, "", { Size = UDim2.new(1, -260, 0, 40), TextSize = 14, TextColor3 = Theme.dim, TextYAlignment = Enum.TextYAlignment.Top })
	local upgradeBtn = Kit.button(c, "", function()
		local f = State.data and State.data.factory
		App.report(Net.request(if f then "factory.upgrade" else "factory.buy"), "🏭 ✔")
	end, { Size = UDim2.fromOffset(250, 38), Position = UDim2.new(1, -250, 0, 0), TextSize = 14 }, "primary")

	Kit.label(c, S.t("factory_lines"), { Size = UDim2.new(0.42, 0, 0, 22), Position = UDim2.fromOffset(0, 48), FontFace = Theme.bold })
	local lines = Kit.list(c, { Size = UDim2.new(0.42, -8, 1, -76), Position = UDim2.fromOffset(0, 76) }, 8)
	local tab = "products"
	local tabs = Kit.tabs(c, { { id = "products", text = "🧪 " .. S.t("factory_products") }, { id = "stock", text = "📦 " .. S.t("factory_stock") } }, function(id)
		tab = id
		if FactoryPanel.fill then
			FactoryPanel.fill()
		end
	end, { Size = UDim2.new(0.58, -8, 0, 30), Position = UDim2.new(0.42, 8, 0, 44) })
	local right = Kit.list(c, { Size = UDim2.new(0.58, -8, 1, -82), Position = UDim2.new(0.42, 8, 0, 82) }, 6)
	local bars = {}

	local function fill()
		local d = State.data
		if not d or not alive then
			return
		end
		local f = d.factory
		Kit.clear(lines)
		Kit.clear(right)
		table.clear(bars)
		if not f then
			local L = Factory.levels[1]
			info.Text = S.t("factory_pitch")
			upgradeBtn.Text = if d.level < L.req then S.t("needs_level", { n = L.req }) else S.t("factory_buy", { price = S.money(L.cost) })
			Kit.setEnabled(upgradeBtn, d.level >= L.req and d.money >= L.cost)
			Kit.label(lines, S.t("factory_none"), { Size = UDim2.new(1, 0, 0, 60), TextColor3 = Theme.dim })
		else
			local L = Factory.level(f.level)
			local nextL = Factory.levels[f.level + 1]
			info.Text = S.t("factory_info", { name = S.pick(L.name), level = f.level, lines = L.lines, speed = string.format("%.2f", L.speed), used = Factory.stocked(f), max = L.storage, elec = S.money(L.elec) })
			if nextL then
				upgradeBtn.Text = if d.level < nextL.req then S.t("needs_level", { n = nextL.req }) else S.t("factory_upgrade", { price = S.money(nextL.cost) })
				Kit.setEnabled(upgradeBtn, d.level >= nextL.req and d.money >= nextL.cost)
			else
				upgradeBtn.Text = S.t("factory_max")
				Kit.setEnabled(upgradeBtn, false)
			end
			-- the lines
			for i = 1, L.lines do
				local l = f.lines and f.lines[i]
				local card = Kit.panel(lines, { Size = UDim2.new(1, 0, 0, 86), BackgroundColor3 = Theme.card, LayoutOrder = i })
				Kit.padding(card, 8)
				if type(l) == "table" and l.part then
					Kit.label(card, string.format("%s  <b>%s %d</b> — %s ×%d", icon(l.part), S.t("factory_line"), i, Kit.esc(partName(l.part)), l.n), { Size = UDim2.new(1, -90, 0, 22), TextWrapped = false, TextTruncate = Enum.TextTruncate.AtEnd })
					local bar = Kit.progress(card, { Position = UDim2.fromOffset(0, 30), Size = UDim2.new(1, -90, 0, 10) }, Theme.good)
					local left = Kit.label(card, "", { Position = UDim2.fromOffset(0, 46), Size = UDim2.new(1, -90, 0, 20), TextSize = 13, TextColor3 = Theme.dim })
					table.insert(bars, { bar = bar, label = left, line = l })
					local stopBtn = Kit.button(card, if l.rep then "⏹ " .. S.t("factory_stop") else "⏸", function()
						App.report(Net.request("factory.stop", { line = i }))
					end, { Size = UDim2.fromOffset(84, 32), Position = UDim2.new(1, -84, 0, 4), TextSize = 13 }, "ghost")
					Kit.setEnabled(stopBtn, l.rep == true)
				else
					Kit.label(card, string.format("⚙️  <b>%s %d</b> — %s", S.t("factory_line"), i, S.t("factory_idle")), { Size = UDim2.new(1, 0, 0, 22) })
					Kit.label(card, S.t("factory_pick"), { Position = UDim2.fromOffset(0, 28), Size = UDim2.new(1, 0, 0, 36), TextSize = 13, TextColor3 = Theme.dim })
				end
			end
			if tab == "products" then
				for i, pr in Factory.products do
					local p = Parts.get(pr.part)
					local locked = f.level < pr.minLevel
					local sub = S.t("factory_product_sub", { n = pr.batch, s = Factory.batchSeconds(pr, f.level), cost = S.money(Factory.materials(pr)), each = S.money(Factory.wholesale(pr.part)) })
					local _, side = Kit.row(right, icon(pr.part), p and p.name or pr.part, sub, { LayoutOrder = i }, 150)
					local b = Kit.button(side, if locked then S.t("factory_needs", { n = pr.minLevel }) else S.t("factory_make"), function()
						-- the first free line
						local fNow = State.data and State.data.factory
						local free = nil
						for li = 1, Factory.level(fNow.level).lines do
							local l = fNow.lines and fNow.lines[li]
							if type(l) ~= "table" or (l.endsAt or 0) <= now() then
								free = li
								break
							end
						end
						if not free then
							App.report({ ok = false, err = "busy" })
							return
						end
						App.report(Net.request("factory.start", { line = free, part = pr.part, rep = true }), "🏭 " .. (p and p.name or ""))
					end, { Size = UDim2.fromOffset(140, 36), TextSize = if locked then 12 else 15 }, "good")
					Kit.setEnabled(b, not locked and d.money >= Factory.materials(pr))
				end
			else
				local any = false
				local ids = {}
				for id in f.stock or {} do
					table.insert(ids, id)
				end
				table.sort(ids)
				for i, id in ids do
					local n = f.stock[id]
					any = true
					local _, side = Kit.row(right, icon(id), partName(id), S.t("factory_stock_sub", { n = n, each = S.money(Factory.wholesale(id)) }), { LayoutOrder = i }, 300)
					Kit.button(side, S.t("factory_ship"), function()
						local r = Net.request("factory.ship", { part = id, n = n })
						App.report(r, if r.ok then S.t("factory_shipped", { n = r.n or 0 }) else nil)
					end, { Size = UDim2.fromOffset(140, 36), TextSize = 13, LayoutOrder = 1 }, "primary")
					Kit.button(side, S.t("factory_sell", { price = S.money(Factory.wholesale(id) * n) }), function()
						local r = Net.request("factory.sell", { part = id, n = n })
						App.report(r, if r.ok then S.t("factory_sold", { n = r.n or 0, price = S.money(r.total or 0) }) else nil)
					end, { Size = UDim2.fromOffset(150, 36), TextSize = 13, LayoutOrder = 2 }, "good")
				end
				if not any then
					Kit.label(right, S.t("factory_empty"), { Size = UDim2.new(1, 0, 0, 40), TextColor3 = Theme.dim })
				end
			end
		end
	end
	FactoryPanel.fill = fill
	tabs.select("products")
	table.insert(conns, State.changed:Connect(fill))
	-- the progress bars tick on their own
	task.spawn(function()
		while alive do
			local t = now()
			for _, b in bars do
				local l = b.line
				local total = math.max(1, (l.endsAt or 0) - (l.started or 0))
				local remaining = math.max(0, (l.endsAt or 0) - t)
				b.bar:set(1 - remaining / total)
				b.label.Text = if remaining > 0 then S.t("factory_left", { s = math.ceil(remaining) }) .. (if l.rep then "  •  🔁" else "") else S.t("factory_ready")
			end
			task.wait(0.5)
		end
	end)
end

function FactoryPanel.init()
	Net.on("factory.open", function()
		FactoryPanel.open()
	end)
end

return FactoryPanel
