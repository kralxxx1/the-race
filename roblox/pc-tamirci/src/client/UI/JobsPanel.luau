-- JobsPanel (J): every job in your shop — queued, on a bench, waiting for pickup — with what the
-- customer said, the price, why a technician got stuck, and selling finished own projects.

local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Shared = ReplicatedStorage:WaitForChild("Shared")
local Net = require(Shared.Net)
local Tools = require(Shared.Data.Tools)

local UI = script.Parent
local Kit = require(UI.Kit)
local Theme = require(UI.Theme)
local Hud = require(UI.Hud)
local App = require(UI.App)
local S = require(UI.Parent.Strings)
local State = require(UI.Parent.State)

local JobsPanel = {}

local win = nil

local STATUS_ORDER = { bench = 1, waiting = 2, ready = 3, showcase = 4 }
local STATUS_COLOR = { bench = Theme.accent, waiting = Theme.accent2, ready = Theme.good, showcase = Color3.fromRGB(170, 110, 240) }

local function blockedText(b): string
	local detail = b.detail or ""
	if b.reason == "need_part" and S.has("cat_" .. detail) then
		detail = S.t("cat_" .. detail)
	elseif b.reason == "need_tool" then
		local t = Tools.get(detail)
		detail = if t then t.icon .. " " .. S.pick(t.name) else detail
	end
	return "⚠️ " .. S.t("job_blocked", { by = b.by or "?", reason = S.t("reason_" .. tostring(b.reason)) .. " " .. detail })
end

local function card(list: ScrollingFrame, job, order: number)
	local f = Kit.panel(list, { Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundColor3 = Theme.card, LayoutOrder = order })
	Kit.padding(f, 10)
	local inner = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.new(1, -170, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	Kit.listLayout(inner, 3)
	local icon = if job.device == "laptop" then "💻" else "🖥️"
	Kit.label(inner, icon .. " <b>" .. (job.name or job.id) .. "</b>", { TextSize = 17, LayoutOrder = 1, Size = UDim2.new(1, 0, 0, 22) })
	local who = if job.customer then "👤 " .. job.customer.name elseif job.client then "🏢 " .. S.pick(job.client) elseif job.own then "🛠️ " .. S.t("job_own") else ""
	local money = if job.price and job.price > 0 then "   💵 " .. S.money(job.price) else ""
	Kit.label(inner, who .. money, { TextColor3 = Theme.dim, TextSize = 14, LayoutOrder = 2 })
	if job.complaint and #job.complaint > 0 then
		Kit.label(inner, "“" .. job.complaint .. "”", { TextSize = 14, LayoutOrder = 3, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	local missing = {}
	for _, tid in job.tools or {} do
		if not State.owns(tid) then
			local t = Tools.get(tid)
			table.insert(missing, if t then t.icon .. " " .. S.pick(t.name) else tid)
		end
	end
	if #missing > 0 then
		Kit.label(inner, S.t("missing_tool", { list = table.concat(missing, ", ") }), { TextColor3 = Theme.bad, TextSize = 13, LayoutOrder = 4, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	if job.blocked and job.status == "waiting" then
		Kit.label(inner, blockedText(job.blocked), { TextColor3 = Theme.warn, TextSize = 13, LayoutOrder = 5, Size = UDim2.new(1, 0, 0, 0), AutomaticSize = Enum.AutomaticSize.Y })
	end
	if job.own and job.resale then
		Kit.label(inner, S.t("job_resale", { price = S.money(job.resale) }), { TextColor3 = Theme.money, TextSize = 13, LayoutOrder = 6 })
	end

	local right = Kit.frame(f, { BackgroundTransparency = 1, Size = UDim2.fromOffset(160, 80), Position = UDim2.new(1, -160, 0, 0) })
	Kit.listLayout(right, 6, false, Enum.HorizontalAlignment.Right)
	local status = job.status or "waiting"
	local text = S.t("job_status_" .. status)
	if status == "bench" and job.bench then
		text ..= " " .. job.bench
	end
	Kit.pill(right, text, STATUS_COLOR[status] or Theme.dim, { LayoutOrder = 1 })
	if job.own and status ~= "bench" and status ~= "showcase" and job.resale then
		Kit.button(right, S.t("job_sell", { price = S.money(job.resale) }), function()
			local r = Net.request("jobs.sell", { job = job.id })
			if r.ok then
				Hud.toast(S.t("job_sold", { price = S.money(r.price or 0) }), "good")
			else
				App.report(r)
			end
		end, { Size = UDim2.fromOffset(150, 34), LayoutOrder = 2, TextSize = 14 }, "warn")
	end
end

function JobsPanel.open()
	local conn
	win = Kit.window(App.screen :: ScreenGui, "📋 " .. S.t("jobs"), Vector2.new(760, 560), function()
		if conn then
			conn:Disconnect()
		end
	end)
	local c = win.content
	local info = Kit.label(c, "", { Size = UDim2.new(1, 0, 0, 22), TextColor3 = Theme.dim, TextSize = 14 })
	local list = Kit.list(c, { Size = UDim2.new(1, 0, 1, -28), Position = UDim2.fromOffset(0, 26) }, 8)
	local function fill()
		Kit.clear(list)
		local jobs = table.clone(State.jobs or {})
		table.sort(jobs, function(a, b)
			local sa, sb = STATUS_ORDER[a.status] or 9, STATUS_ORDER[b.status] or 9
			if sa ~= sb then
				return sa < sb
			end
			return tostring(a.id) < tostring(b.id)
		end)
		info.Text = S.t("job_count", { n = #jobs })
		for i, job in jobs do
			card(list, job, i)
		end
		if #jobs == 0 then
			Kit.label(list, S.t("job_none"), { TextColor3 = Theme.dim, Size = UDim2.new(1, 0, 0, 60) })
		end
	end
	fill()
	conn = State.jobsChanged:Connect(fill)
end

function JobsPanel.toggle()
	if win and win.isOpen() then
		win.close()
	else
		JobsPanel.open()
	end
end

return JobsPanel
