-- CustomerDialog: talking to a customer at the counter. Shows what they say, the device and the
-- tools it will take, their offer, and lets you accept, haggle (ask for more) or decline.
-- The shady seller offers a "deal" instead.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Tools = require(Shared.Data.Tools)
local Parts = require(Shared.Data.Parts)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local CustomerDialog = {}

local win = nil

local function reply(id: string, action: string, price: number?)
	return Net.request("customer.reply", { id = id, action = action, price = price })
end

local function render(o)
	if win then
		win.close(true)
	end
	local archName = S.pick(o.archName)
	win = Kit.window(App.screen :: ScreenGui, "👤 " .. S.t("talk_title", { name = o.name, arch = archName }), Vector2.new(600, 470))
	local body = Kit.frame(win.content, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 1, -56) })
	Kit.listLayout(body, 8)

	-- what they say
	local bubble = Kit.panel(body, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = 1 })
	Kit.padding(bubble, 12)
	Kit.label(bubble, S.t("talk_quote", { text = o.text or "..." }), { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, TextSize = 18, FontFace = Theme.font })

	if o.kind == "sell" and o.sale then
		local p = Parts.get(o.sale.part)
		local icon = p and Theme.catIcon[p.cat] or "📦"
		Kit.label(body, icon .. " <b>" .. o.sale.name .. "</b>", { TextSize = 18, LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 26) })
		if p then
			Kit.label(body, Parts.spec(p, S.lang()), { TextColor3 = Theme.dim, TextSize = 14, LayoutOrder = 3 })
		end
		Kit.label(body, S.t("talk_retail", { price = S.money(o.sale.retail) }) .. "   •   " .. S.t("talk_offer", { price = "<b>" .. S.money(o.sale.price) .. "</b>" }), { LayoutOrder = 4, TextColor3 = Theme.money, Size = UDim2.new(1, 0, 0, 24) })
		Kit.label(body, "⚠️ " .. S.t("talk_sell_warn"), { LayoutOrder = 5, TextColor3 = Theme.warn, TextSize = 15, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
		Kit.button(win.content, S.t("talk_buy", { price = S.money(o.sale.price) }), function()
			local r = reply(o.id, "buy")
			if App.report(r, S.t("talk_bought", { name = o.sale.name })) then
				win.close()
			end
		end, { Size = UDim2.new(0.48, 0, 0, 46), Position = UDim2.new(0, 0, 1, -48) }, "warn")
		Kit.button(win.content, S.t("talk_reject"), function()
			reply(o.id, "reject")
			win.close()
		end, { Size = UDim2.new(0.48, 0, 0, 46), Position = UDim2.new(0.52, 0, 1, -48) }, "ghost")
		return
	end

	-- the device and what it will take
	if o.device then
		local icon = if o.deviceKind == "laptop" then "💻" else "🖥️"
		Kit.label(body, icon .. " " .. S.t("talk_device", { device = "<b>" .. o.device .. "</b>" }), { TextSize = 17, LayoutOrder = 2, Size = UDim2.new(1, 0, 0, 24) })
	end
	if o.requestId then
		Kit.pill(body, "📝 " .. S.t("request_label"), Theme.accent, { LayoutOrder = 3 })
	end
	local missing, have = {}, {}
	for _, tid in o.tools or {} do
		local t = Tools.get(tid)
		if t then
			table.insert(if State.owns(tid) then have else missing, t.icon .. " " .. S.pick(t.name))
		end
	end
	if #missing > 0 then
		Kit.label(body, S.t("missing_tool", { list = table.concat(missing, ", ") }), { TextColor3 = Theme.bad, TextSize = 15, LayoutOrder = 4, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	elseif #have > 0 then
		Kit.label(body, "✔ " .. S.t("talk_tools_ok"), { TextColor3 = Theme.good, TextSize = 15, LayoutOrder = 4 })
	end

	-- offer and haggling
	Kit.label(body, S.t("talk_offer", { price = S.money(o.offer) }), { TextSize = 24, FontFace = Theme.heavy, TextColor3 = Theme.money, LayoutOrder = 5, Size = UDim2.new(1, 0, 0, 32) })
	if (o.rounds or 0) > 0 then
		local row = Kit.frame(body, { BackgroundTransparency = 1, Size = UDim2.new(1, 0, 0, 40), LayoutOrder = 6 })
		Kit.listLayout(row, 8, true)
		Kit.label(row, S.t("talk_more"), { Size = UDim2.fromOffset(120, 36), TextColor3 = Theme.dim, LayoutOrder = 0 })
		for i, f in { 1.1, 1.25, 1.5 } do
			local ask = math.max(o.offer + 1, math.floor(o.offer * f + 0.5))
			Kit.button(row, S.t("talk_ask", { price = S.money(ask) }), function()
				local r = reply(o.id, "haggle", ask)
				if not r.ok then
					App.report(r)
					if r.err == "gone" then
						win.close()
					end
					return
				end
				if r.done then
					win.close()
					if r.walked then
						Hud.toast(S.t("talk_walked"), "bad")
					else
						Hud.toast(S.t("talk_deal", { price = S.money(r.price or ask) }), "good")
					end
				elseif r.offer then
					render(r.offer)
				end
			end, { Size = UDim2.fromOffset(140, 36), LayoutOrder = i, TextSize = 15 }, "warn")
		end
		Kit.label(body, S.t("talk_rounds", { n = o.rounds }), { TextColor3 = Theme.dim, TextSize = 13, LayoutOrder = 7 })
	end

	Kit.button(win.content, S.t("talk_accept", { price = S.money(o.offer) }), function()
		local r = reply(o.id, "accept")
		if r.ok and r.done then
			win.close()
			Hud.toast(S.t("talk_taken", { device = o.device or "", price = S.money(o.offer) }), "good")
		else
			App.report(r)
			if r.err == "gone" then
				win.close()
			end
		end
	end, { Size = UDim2.new(0.48, 0, 0, 46), Position = UDim2.new(0, 0, 1, -48) }, "good")
	Kit.button(win.content, S.t("talk_reject"), function()
		reply(o.id, "reject")
		win.close()
	end, { Size = UDim2.new(0.48, 0, 0, 46), Position = UDim2.new(0.52, 0, 1, -48) }, "ghost")
end

function CustomerDialog.open(offer)
	render(offer)
end

function CustomerDialog.init()
	Net.on("customer.talk", CustomerDialog.open)
end

return CustomerDialog
