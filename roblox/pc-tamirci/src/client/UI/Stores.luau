-- Stores: the city's counters. One window per service:
--   parts / parts_bazaar  new parts by category (+ daily deals, search)
--   used                  second-hand listings and selling your parts
--   scrap                 junk PCs to strip, and scrap prices for anything
--   tools                 the hardware shop
--   realty                your shop panel and how to move
--   board                 the city leaderboard
--   police                your thief-catching record

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Market = require(Shared.Economy.Market)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local ShopPanel = require(UI.ShopPanel)
local QuestsPanel = require(UI.QuestsPanel)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local Stores = {}

local MAX_ROWS = 120

-- Opens a window that tells the server we left the counter when it closes, and drops its
-- state listeners.
local function storeWindow(title: string, size: Vector2?)
	local conns = {}
	local win
	win = Kit.window(App.screen :: ScreenGui, title, size or Vector2.new(900, 590), function()
		for _, c in conns do
			c:Disconnect()
		end
		task.spawn(Net.request, "market.close")
	end)
	win.conns = conns
	return win
end

local function storageText(): string
	local d = State.data
	if not d then
		return ""
	end
	return "📦 " .. S.t("storage", { n = #d.inv, m = d.capacity or 0 })
end

local function partSub(p, extra: string?): string
	local spec = Parts.spec(p, S.lang())
	if extra and #extra > 0 then
		return extra .. (if #spec > 0 then " • " .. spec else "")
	end
	return spec
end

local function condText(item): string
	if item.cond and item.cond < 0.999 then
		return S.t("cond", { n = math.floor(item.cond * 100) })
	end
	return S.t("cond_new")
end

-- Buy buttons grey out while you can't afford them.
local function moneyGate(win, buttons: { { b: TextButton, price: number } })
	local function update()
		local m = State.money()
		for _, e in buttons do
			if e.b.Parent and not e.b:GetAttribute("Done") then
				Kit.setEnabled(e.b, m >= e.price)
			end
		end
	end
	update()
	table.insert(win.conns, State.changed:Connect(update))
	return update
end

----------------------------------------------------------------------------------------------------
-- New parts
----------------------------------------------------------------------------------------------------
local function partsStore(o)
	local bazaar = o.service == "parts_bazaar"
	local win = storeWindow((if bazaar then "🔌 " .. S.t("store_bazaar") else "🏬 " .. S.t("store_parts")), Vector2.new(940, 600))
	local c = win.content
	local info = Kit.label(c, "", { Size = UDim2.new(1, -270, 0, 24), TextColor3 = Theme.dim, TextSize = 14 })
	local search = Kit.input(c, "🔍 " .. S.t("search"), { Size = UDim2.fromOffset(250, 30), Position = UDim2.new(1, -250, 0, -3) })
	local function refreshInfo()
		info.Text = Kit.esc(storageText() .. (if bazaar then "   •   " .. S.t("store_bazaar_hint") else ""))
	end
	refreshInfo()
	table.insert(win.conns, State.changed:Connect(refreshInfo))

	local byCat, deals = {}, {}
	for _, e in o.data.catalog or {} do
		local p = Parts.get(e.id)
		if p then
			local entry = { p = p, price = e.price, deal = e.deal }
			byCat[p.cat] = byCat[p.cat] or {}
			table.insert(byCat[p.cat], entry)
			if e.deal then
				table.insert(deals, entry)
			end
		end
	end
	local tabs = {}
	if #deals > 0 then
		table.insert(tabs, { id = "deals", text = "🔥 " .. S.t("deal") })
	end
	for _, cat in Parts.Categories do
		if byCat[cat] then
			table.insert(tabs, { id = cat, text = (Theme.catIcon[cat] or "") .. " " .. S.t("cat_" .. cat) })
		end
	end
	local list = Kit.list(c, { Size = UDim2.new(1, -200, 1, -72), Position = UDim2.fromOffset(200, 70) })
	local selected = tabs[1] and tabs[1].id or "gpu"
	local gate = {}
	local updateGate = moneyGate(win, gate)
	-- brand filter and sort order for the selected category
	local brandBar = Kit.frame(c, { BackgroundTransparency = 1, Size = UDim2.new(1, -330, 0, 30), Position = UDim2.fromOffset(200, 36) })
	Kit.listLayout(brandBar, 5, true)
	local brand = nil -- nil = all
	local byPerf = false
	local fill
	local sortButton = Kit.button(c, S.t("sort_price"), function()
		byPerf = not byPerf
		fill()
	end, { Size = UDim2.fromOffset(120, 28), Position = UDim2.new(1, -120, 0, 37), TextSize = 13 }, "ghost")

	local function brandOf(p): string
		if p.cat == "gpu" or p.cat == "cpu" then
			return ({ nvidia = "NVIDIA", amd = "AMD", intel = "Intel" })[p.brand] or "?"
		end
		return string.match(p.name, "^(%S+)") or "?"
	end

	local function brandButtons()
		Kit.clear(brandBar)
		local names, seen = {}, {}
		for _, e in byCat[selected] or {} do
			local b = brandOf(e.p)
			if not seen[b] then
				seen[b] = true
				table.insert(names, b)
			end
		end
		table.sort(names)
		brandBar.Visible = #names > 1 and #names <= 9 and selected ~= "deals"
		if not brandBar.Visible then
			return
		end
		table.insert(names, 1, "")
		for i, b in names do
			local on = (brand or "") == b
			local btn = Kit.button(brandBar, if b == "" then S.t("all") else b, function()
				brand = if b == "" then nil else b
				brandButtons()
				fill()
			end, { Size = UDim2.new(0, 0, 1, 0), AutomaticSize = Enum.AutomaticSize.X, LayoutOrder = i, TextSize = 13 }, if on then "primary" else "ghost")
			local pad = Instance.new("UIPadding")
			pad.PaddingLeft, pad.PaddingRight = UDim.new(0, 10), UDim.new(0, 10)
			pad.Parent = btn
		end
	end

	function fill()
		Kit.clear(list)
		table.clear(gate)
		local q = string.lower(search.Text)
		local rows = {}
		if #q > 0 then
			for _, entries in byCat do
				for _, e in entries do
					if string.find(string.lower(e.p.name), q, 1, true) then
						table.insert(rows, e)
					end
				end
			end
		elseif selected == "deals" then
			rows = table.clone(deals)
		else
			for _, e in byCat[selected] or {} do
				if not brand or brandOf(e.p) == brand then
					table.insert(rows, e)
				end
			end
		end
		sortButton.Text = S.t(if byPerf then "sort_perf" else "sort_price")
		table.sort(rows, function(a, b)
			if byPerf and (a.p.perf or 0) ~= (b.p.perf or 0) then
				return (a.p.perf or 0) > (b.p.perf or 0)
			end
			return a.price < b.price
		end)
		for i, e in rows do
			if i > MAX_ROWS then
				Kit.label(list, S.t("rows_more", { n = #rows - MAX_ROWS }), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 36), LayoutOrder = i })
				break
			end
			local p = e.p
			local extra = nil
			if p.uses then
				extra = S.t("stock_uses", { n = p.uses }) .. " • " .. S.t("owned") .. ": " .. State.stock(p.id)
			end
			local _, right = Kit.row(list, Theme.catIcon[p.cat] or "📦", p.name, if extra then extra else partSub(p), { LayoutOrder = i })
			if e.deal then
				Kit.pill(right, "-25%", Theme.bad, { LayoutOrder = 0 })
			end
			Kit.label(right, S.money(e.price), { Size = UDim2.fromOffset(84, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right, LayoutOrder = 1 })
			local b = Kit.button(right, S.t("buy"), function()
				local r = Net.request("market.buy", { id = p.id, qty = 1 })
				if r.ok then
					Hud.toast(if r.job then S.t("project_added") else S.t("bought", { name = p.name }), "good")
				else
					App.report(r)
				end
			end, { Size = UDim2.fromOffset(92, 36), LayoutOrder = 2 }, "primary")
			table.insert(gate, { b = b, price = e.price })
		end
		if #rows == 0 then
			Kit.label(list, S.t("empty"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
		end
		updateGate()
	end
	local side = Kit.sidebar(c, tabs, function(id)
		selected = id
		brand = nil
		if #search.Text > 0 then
			search.Text = ""
		end
		brandButtons()
		fill()
	end, { Position = UDim2.fromOffset(0, 34), Size = UDim2.new(0, 190, 1, -36) })
	local pending = false
	search:GetPropertyChangedSignal("Text"):Connect(function()
		if pending then
			return
		end
		pending = true
		task.delay(0.25, function()
			pending = false
			if win.isOpen() then
				fill()
			end
		end)
	end)
	side.select(selected)
end

----------------------------------------------------------------------------------------------------
-- Selling your inventory (used market and scrapyard)
----------------------------------------------------------------------------------------------------
local function sellList(win, parent: Instance, priceOf: (any) -> number)
	local list = Kit.list(parent)
	local function fill()
		Kit.clear(list)
		local items = State.data and State.data.inv or {}
		local sorted = table.clone(items)
		table.sort(sorted, function(a, b)
			return priceOf(a) > priceOf(b)
		end)
		for i, item in sorted do
			local p = Parts.get(item.part)
			if p then
				local sub = condText(item) .. (if item.broken then " • " .. S.t("broken") else "")
				local _, right = Kit.row(list, Theme.catIcon[p.cat] or "📦", p.name, sub, { LayoutOrder = i })
				local price = priceOf(item)
				Kit.button(right, S.t("sell") .. " " .. S.money(price), function()
					local r = Net.request("market.sell", { uid = item.uid })
					if r.ok then
						Hud.toast(S.t("sold", { price = S.money(r.price or price) }), "good")
					else
						App.report(r)
					end
				end, { Size = UDim2.fromOffset(150, 36) }, "warn")
			end
		end
		if #sorted == 0 then
			Kit.label(list, S.t("store_sell_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 40) })
		end
	end
	fill()
	table.insert(win.conns, State.changed:Connect(function(d, prev)
		if not prev or #d.inv ~= #prev.inv then
			fill()
		end
	end))
	return list
end

-- A window with a hint line and two pages (buy / sell).
local function twoPages(win, hint: string, buyText: string, buildBuy: (Instance) -> (), buildSell: (Instance) -> ())
	local c = win.content
	Kit.label(c, hint, { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 14 })
	local pages = {}
	local area = Kit.frame(c, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -72), Position = UDim2.fromOffset(0, 70) })
	local built = {}
	local tabs = Kit.tabs(c, { { id = "buy", text = buyText }, { id = "sell", text = S.t("sell_tab") } }, function(id)
		for k, f in pages do
			f.Visible = k == id
		end
		if not built[id] then
			built[id] = true
			local f = Kit.frame(area, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
			pages[id] = f
			if id == "buy" then
				buildBuy(f)
			else
				buildSell(f)
			end
		end
	end, { Position = UDim2.fromOffset(0, 28) })
	tabs.select("buy")
end

local function usedStore(o)
	local win = storeWindow("♻️ " .. S.t("store_used"))
	twoPages(win, S.t("store_used_hint"), S.t("buy_tab"), function(page)
		local list = Kit.list(page)
		local gate = {}
		for i, l in o.data.listings or {} do
			local p = Parts.get(l.part)
			if p then
				local sub = condText(l) .. " • " .. S.t("risk", { n = l.risk }) .. " • " .. Parts.spec(p, S.lang())
				local _, right = Kit.row(list, Theme.catIcon[p.cat] or "📦", p.name, sub, { LayoutOrder = i })
				Kit.label(right, S.money(l.price), { Size = UDim2.fromOffset(80, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
				local b
				b = Kit.button(right, S.t("buy"), function()
					local r = Net.request("market.buyUsed", { id = l.id })
					if r.ok or r.err == "sold" then
						b:SetAttribute("Done", true)
						b.Text = S.t("sold_out")
						Kit.setEnabled(b, false)
					end
					if r.ok then
						Hud.toast(S.t("bought", { name = p.name }), "good")
					else
						App.report(r)
					end
				end, { Size = UDim2.fromOffset(110, 36) }, "primary")
				table.insert(gate, { b = b, price = l.price })
			end
		end
		moneyGate(win, gate)
	end, function(page)
		sellList(win, page, Market.sellPrice)
	end)
end

local function scrapStore(o)
	local win = storeWindow("🏗️ " .. S.t("store_scrap"))
	twoPages(win, S.t("store_scrap_hint"), "🖥️ " .. S.t("junk_pc"), function(page)
		local list = Kit.list(page)
		local gate = {}
		local looks = { beige = Color3.fromRGB(214, 200, 168), black = Color3.fromRGB(40, 40, 44), grey = Color3.fromRGB(150, 150, 156) }
		for i, j in o.data.junk or {} do
			local f, right = Kit.row(list, "🖥️", S.t("junk_pc") .. " #" .. i, S.t("junk_desc"), { LayoutOrder = i })
			local swatch = Kit.frame(f, { Size = UDim2.fromOffset(10, 40), Position = UDim2.fromOffset(4, 9), BackgroundColor3 = looks[j.look] or Theme.dim })
			Kit.corner(swatch, UDim.new(0, 4))
			Kit.label(right, S.money(j.price), { Size = UDim2.fromOffset(80, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
			local b
			b = Kit.button(right, S.t("buy"), function()
				local r = Net.request("market.buyJunk", { id = j.id })
				if r.ok or r.err == "sold" then
					b:SetAttribute("Done", true)
					b.Text = S.t("sold_out")
					Kit.setEnabled(b, false)
				end
				if r.ok then
					Hud.toast(S.t("project_added"), "good")
				else
					App.report(r)
				end
			end, { Size = UDim2.fromOffset(110, 36) }, "primary")
			table.insert(gate, { b = b, price = j.price })
		end
		moneyGate(win, gate)
	end, function(page)
		sellList(win, page, Market.scrapPrice)
	end)
end

----------------------------------------------------------------------------------------------------
-- Tools
----------------------------------------------------------------------------------------------------
local function toolStore()
	local win = storeWindow("🧰 " .. S.t("store_tools"), Vector2.new(860, 600))
	local c = win.content
	Kit.label(c, S.t("store_tools_hint"), { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 14 })
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -30), Position = UDim2.fromOffset(0, 28) })
	local function fill()
		Kit.clear(list)
		local sorted = table.clone(Tools.list)
		table.sort(sorted, function(a, b)
			return (a.order or 99) < (b.order or 99)
		end)
		for i, t in sorted do
			if t.id ~= "hand" then
				local sub = S.pick(t.desc) .. (if t.bits then "  " .. S.t("bits", { list = table.concat(t.bits, ", ") }) else "")
				local _, right = Kit.row(list, t.icon, S.pick(t.name), sub, { LayoutOrder = i })
				if State.owns(t.id) then
					Kit.pill(right, "✔ " .. S.t("tool_owned"), Theme.good)
				else
					Kit.label(right, S.money(t.price), { Size = UDim2.fromOffset(80, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
					local locked = State.level() < (t.level or 1)
					local b = Kit.button(right, if locked then S.t("needs_level", { n = t.level }) else S.t("buy"), function()
						local r = Net.request("tools.buy", { id = t.id })
						App.report(r, S.t("bought", { name = S.pick(t.name) }))
					end, { Size = UDim2.fromOffset(if locked then 130 else 92, 36), TextSize = if locked then 13 else 16 }, "primary")
					Kit.setEnabled(b, not locked and State.money() >= t.price)
				end
			end
		end
	end
	fill()
	table.insert(win.conns, State.changed:Connect(fill))
end

----------------------------------------------------------------------------------------------------
-- Leaderboard and police
----------------------------------------------------------------------------------------------------
local function leaders(o, c: Instance)
	Kit.label(c, S.t("board_cols"), { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 14 })
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -30), Position = UDim2.fromOffset(0, 28) })
	local me = game:GetService("Players").LocalPlayer
	for i, row in o.data.rows or {} do
		local medal = if i == 1 then "🥇" elseif i == 2 then "🥈" elseif i == 3 then "🥉" else "#" .. i
		local mine = me and row.name == me.DisplayName
		local f, right = Kit.row(list, medal, row.name .. (if mine then " " .. S.t("board_you") else ""), S.t("level") .. " " .. row.level .. " • " .. S.t("stat_repairs", { n = row.repairs }) .. " • ★ " .. row.rep, { LayoutOrder = i })
		if mine then
			Kit.outline(f, Theme.accent, 2, 0)
		end
		Kit.label(right, S.money(row.money), { Size = UDim2.fromOffset(120, 36), TextColor3 = Theme.money, FontFace = Theme.bold, TextXAlignment = Enum.TextXAlignment.Right })
	end
end

-- City hall: today's tasks and the leaderboard.
local function board(o)
	local win = storeWindow("🏛️ " .. S.t("store_board"), Vector2.new(760, 560))
	local c = win.content
	local area = Kit.frame(c, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -44), Position = UDim2.fromOffset(0, 44) })
	local pages = {}
	local tabs = Kit.tabs(c, { { id = "quests", text = "📜 " .. S.t("quests_title") }, { id = "leaders", text = "🏆 " .. S.t("board_leaders") } }, function(id)
		for k, f in pages do
			f.Visible = k == id
		end
		if not pages[id] then
			local f = Kit.frame(area, { BackgroundTransparency = 1, Size = UDim2.fromScale(1, 1) })
			pages[id] = f
			if id == "quests" then
				local refresh = QuestsPanel.render(f)
				table.insert(win.conns, State.changed:Connect(refresh))
			else
				leaders(o, f)
			end
		end
	end)
	tabs.select("quests")
end

local function police()
	local win = storeWindow("🚓 " .. S.t("store_police"), Vector2.new(520, 300))
	local st = State.data and State.data.stats or {}
	Kit.label(win.content, S.t("store_police_text", { caught = st.caught or 0, robbed = st.robbed or 0 }), { Size = UDim2.fromScale(1, 1), TextSize = 18, TextYAlignment = Enum.TextYAlignment.Top })
end

----------------------------------------------------------------------------------------------------
function Stores.open(o)
	local service = o.service
	Stores.lastOpened = { service = service, at = os.clock() }
	if service == "parts" or service == "parts_bazaar" then
		partsStore(o)
	elseif service == "used" then
		usedStore(o)
	elseif service == "scrap" then
		scrapStore(o)
	elseif service == "tools" then
		toolStore()
	elseif service == "realty" then
		ShopPanel.open({ freePlots = o.data.free and #o.data.free or 0, onClose = function()
			task.spawn(Net.request, "market.close")
		end })
	elseif service == "board" then
		board(o)
	elseif service == "police" then
		police()
	end
end

function Stores.init()
	Net.on("service.open", Stores.open)
end

return Stores
