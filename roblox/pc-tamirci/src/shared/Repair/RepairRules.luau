-- RepairRules: the single source of truth for what a technician may do to a device and what the
-- device does when powered on. The server runs it authoritatively; the client runs the same checks
-- to show hints before sending a request.
--
-- Device state ("dev") is a plain table so it can be sent over the network:
--   kind, model, nodes[id] = { st, part?, cond?, dust?, os?, virus? }, paste = { st, q },
--   orient/lid (laptops), liquid, tray = { items }, strap, ties, tests, boot (drive node id),
--   sw = { bios }, orig = { [nodeId] = true } (slots occupied when the customer brought it in),
--   hidden = { [nodeId] = fault flag } (server only, stripped by Rules.view)

local Shared = script.Parent.Parent
local Templates = require(script.Parent.DeviceTemplates)
local Parts = require(Shared.Data.Parts)
local Tools = require(Shared.Data.Tools)
local Devices = require(Shared.Data.Devices)
local Config = require(Shared.Config)

local Rules = {}
Rules.Templates = Templates

local FAN_ORDER = { "fan_r", "fan_f1", "fan_f2", "fan_f3", "fan_t1", "fan_t2" }
local DESKTOP_DRIVES = { "nvme1", "nvme2", "ssd1", "hdd1" }
local LAPTOP_DRIVES = { "lnvme", "lsata" }
Rules.FanOrder = FAN_ORDER

----------------------------------------------------------------------------------------------------
-- Messages
----------------------------------------------------------------------------------------------------
local REASONS = {
	not_present = { tr = "Bu parça bu cihazda yok.", en = "That part isn't present on this device." },
	no_tool = { tr = "Bu alete sahip değilsin.", en = "You don't own that tool." },
	wrong_tool = { tr = "Bu iş için başka bir alet gerekiyor.", en = "That needs a different tool." },
	wrong_bit = { tr = "Tornavida ucu bu vidaya uymuyor ({bit} lazım).", en = "Wrong bit for this screw ({bit} needed)." },
	wrong_target = { tr = "Bu aletle buna bir şey yapılamaz.", en = "That tool can't be used on this." },
	already = { tr = "Zaten öyle.", en = "Already done." },
	flip_bottom = { tr = "Önce laptopu ters çevir.", en = "Flip the laptop over first." },
	flip_top = { tr = "Önce laptopu düz çevir.", en = "Turn the laptop right side up first." },
	lid_open = { tr = "Önce ekran kapağını aç.", en = "Open the lid first." },
	lid_closed = { tr = "Çevirmeden önce kapağı kapat.", en = "Close the lid before flipping." },
	remove_first = { tr = "Önce şunu çıkar: {node}.", en = "Remove this first: {node}." },
	unplug_first = { tr = "Önce şu kabloyu çıkar: {node}.", en = "Unplug this first: {node}." },
	unscrew_first = { tr = "Önce vidalarını sök ({count} vida kaldı).", en = "Unscrew it first ({count} screws left)." },
	open_latch_first = { tr = "Önce mandalı aç: {node}.", en = "Open the latch first: {node}." },
	peel_first = { tr = "Bu vida kauçuk ayağın altında. Önce ayağı spudger ile kaldır.", en = "This screw hides under a rubber foot. Peel it with a spudger first." },
	pry_first = { tr = "Klipsli: önce spudger ile kanırt.", en = "It's clipped in: pry it with a spudger first." },
	desolder_first = { tr = "Lehimli: önce havya ile lehimini al.", en = "It's soldered: desolder it first." },
	solder_first = { tr = "Önce lehimle.", en = "Solder it first." },
	board_out_first = { tr = "Lehim için anakartı kasadan çıkarıp tezgaha al.", en = "Take the motherboard out of the case to solder." },
	ends_missing = { tr = "Kablonun takılacağı parça yerinde değil.", en = "The part this cable plugs into isn't installed." },
	nothing_to_install = { tr = "Takılacak parça seçilmedi.", en = "No part selected to install." },
	slot_busy = { tr = "Yuva dolu.", en = "The slot is occupied." },
	incompatible = { tr = "Uyumsuz: {why}", en = "Incompatible: {why}" },
	children_attached = { tr = "Önce üzerindeki parçaları çıkar: {node}.", en = "Remove what's mounted on it first: {node}." },
	need_parent = { tr = "Önce {node} takılmalı.", en = "{node} must be installed first." },
	clean_paste_first = { tr = "Eski macunu önce alkolle temizle.", en = "Clean off the old paste first." },
	cooler_off_first = { tr = "Önce işlemci soğutucusunu çıkar.", en = "Remove the CPU cooler first." },
	no_dust = { tr = "Burada temizlenecek toz kalmadı.", en = "No dust left here." },
	no_paste_left = { tr = "Termal macunun bitti. Parçacıdan al.", en = "You're out of thermal paste. Buy some." },
	no_solder_left = { tr = "Lehim telin bitti.", en = "You're out of solder wire." },
	no_ties_left = { tr = "Kablo bağın bitti.", en = "You're out of zip ties." },
	cpu_out_first = { tr = "Pinlere ulaşmak için işlemciyi çıkar.", en = "Remove the CPU to reach the pins." },
	pins_ok = { tr = "Pinler zaten düzgün.", en = "The pins are already straight." },
	not_laptop = { tr = "Bu sadece laptoplarda yapılır.", en = "Only for laptops." },
	not_desktop = { tr = "Bu sadece masaüstü bilgisayarlarda yapılır.", en = "Only for desktops." },
	cables_first = { tr = "Önce tüm kabloları tak.", en = "Plug in all the cables first." },
	no_boot_for_usb = { tr = "USB'den açmak için cihazın görüntü vermesi lazım.", en = "The device must POST with a picture to boot the USB." },
	no_drive = { tr = "Kurulum yapılacak sağlam bir disk yok.", en = "There's no healthy drive to install to." },
	board_needed = { tr = "Bunun için anakart ve PSU takılı olmalı.", en = "The motherboard and PSU must be installed." },
	psu_needed = { tr = "Güç kaynağı yok.", en = "There is no power supply." },
}
Rules.Reasons = REASONS

local function fmt(s: string, vars: { [string]: any }?): string
	if not vars then
		return s
	end
	return (string.gsub(s, "{(%w+)}", function(k)
		local v = vars[k]
		if v == nil then
			return "{" .. k .. "}"
		end
		return tostring(v)
	end))
end

function Rules.message(key: string, lang: string?, vars: { [string]: any }?): string
	local m = REASONS[key]
	if not m then
		return key
	end
	return fmt(if lang == "en" then m.en else m.tr, vars)
end

----------------------------------------------------------------------------------------------------
-- Basic accessors
----------------------------------------------------------------------------------------------------
local function tmpl(dev)
	return Templates[dev.kind]
end

function Rules.tnode(dev, id: string)
	return Templates[dev.kind].nodes[id]
end
local tnode = Rules.tnode

local function st(dev, id: string): string?
	local s = dev.nodes[id]
	return s and s.st
end

local function label(dev, id: string, lang: string?): string
	local tn = tnode(dev, id)
	if not tn or not tn.label then
		return id
	end
	return if lang == "en" then tn.label.en else tn.label.tr
end
Rules.label = label

function Rules.laptopModel(dev)
	if dev.kind ~= "laptop" then
		return nil
	end
	return Devices.laptop(dev.model)
end

-- Part definition of whatever part sits in node `id` (installed or lying out), or nil.
function Rules.part(dev, id: string)
	local s = dev.nodes[id]
	if not s or not s.part then
		return nil
	end
	return Parts.get(s.part)
end
local partOf = Rules.part

local function caseDef(dev)
	if dev.kind ~= "desktop" then
		return nil
	end
	return Parts.get(dev.model)
end

function Rules.isSoldered(dev, id: string): boolean
	local tn = tnode(dev, id)
	if not tn then
		return false
	end
	if tn.solder then
		return true
	end
	if dev.kind == "laptop" and id == "dcjack" then
		local m = Rules.laptopModel(dev)
		return m ~= nil and m.dcSoldered == true
	end
	return false
end

-- Does this node exist on this particular device (given its parts)?
function Rules.available(dev, id: string): boolean
	local tn = tnode(dev, id)
	if not tn then
		return false
	end
	if tn.kind == "screw" or tn.kind == "latch" then
		if tn.kind == "screw" and tn.underFeet then
			local m = Rules.laptopModel(dev)
			if not m or (tn.index - 10) > m.feetScrews then
				return false
			end
		end
		if tn.kind == "screw" and dev.kind == "laptop" and tn.owner == "dcjack" and Rules.isSoldered(dev, "dcjack") then
			return false
		end
		return Rules.available(dev, tn.owner)
	end
	if tn.kind == "cable" then
		local i = string.match(id, "^cpcie(%d)$")
		if i then
			local g = partOf(dev, "gpu")
			if not g or #Parts.gpuConnectors(g) < tonumber(i) :: number then
				return false
			end
		end
		if id == "dc_conn" and Rules.isSoldered(dev, "dcjack") then
			return false
		end
		return Rules.available(dev, tn.ends[1]) and Rules.available(dev, tn.ends[2])
	end

	if dev.kind == "desktop" then
		local mobo = partOf(dev, "mobo")
		local case = caseDef(dev)
		local ram = string.match(id, "^ram(%d)$")
		if ram then
			return mobo ~= nil and tonumber(ram) :: number <= mobo.memSlots
		end
		local nv = string.match(id, "^nvme(%d)$")
		if nv then
			return mobo ~= nil and tonumber(nv) :: number <= mobo.m2
		end
		if tn.parent == "mobo" or id == "gpu" then
			return mobo ~= nil
		end
		local fi = table.find(FAN_ORDER, id)
		if fi then
			return case ~= nil and fi <= case.fanSlots
		end
		if id == "hdd1" then
			return case ~= nil and case.style ~= "itx" and case.style ~= "sff"
		end
		return true
	else
		local m = Rules.laptopModel(dev)
		if not m then
			return false
		end
		local lr = string.match(id, "^lram(%d)$")
		if lr then
			return tonumber(lr) :: number <= m.ramSlots
		end
		if id == "lsata" then
			return m.class == "budget15"
		end
		if id == "feet" then
			return m.feetScrews > 0
		end
		return true
	end
end
local available = Rules.available

-- Resolves the screwdriver head a screw needs.
function Rules.screwBit(dev, id: string): string
	local tn = tnode(dev, id)
	if tn.bit == "model" then
		local m = Rules.laptopModel(dev)
		return if m then m.screwBit else "PH1"
	end
	if dev.kind == "desktop" and (string.sub(id, 1, 3) == "nv1" or string.sub(id, 1, 3) == "nv2") then
		local mobo = partOf(dev, "mobo")
		if mobo and mobo.price >= 250 then
			return "toolless"
		end
	end
	return tn.bit
end

local function toolBitOk(toolId: string, bit: string): boolean
	if bit == "thumb" then
		return toolId == "hand" or Tools.canDo(toolId, "unscrew", "PH2")
	end
	if bit == "toolless" then
		return toolId == "hand" or Tools.canDo(toolId, "unscrew", "PH1")
	end
	return Tools.canDo(toolId, "unscrew", bit)
end

----------------------------------------------------------------------------------------------------
-- Compatibility
----------------------------------------------------------------------------------------------------
local function why(lang, tr, en)
	return if lang == "en" then en else tr
end

-- Can part `p` go into node `id`? Returns ok, explanation.
function Rules.compatible(dev, id: string, p, lang: string?): (boolean, string?)
	local tn = tnode(dev, id)
	if not tn or tn.kind ~= "comp" or not p then
		return false, why(lang, "yanlış yuva", "wrong slot")
	end
	if p.cat ~= tn.cat then
		return false, why(lang, "bu yuvaya bu tür parça takılmaz", "wrong kind of part for this slot")
	end
	if tn.sub and p.sub ~= tn.sub then
		return false, why(lang, "bu yuvaya bu tür parça takılmaz", "wrong kind of part for this slot")
	end
	if p.cat == "laptop" then
		local m = Rules.laptopModel(dev)
		if not m or p.lclass ~= m.class then
			return false, why(lang, "başka laptop sınıfı için", "made for another laptop class")
		end
		return true
	end
	if p.cat == "misc" and p.sub == "wifi" and dev.kind == "laptop" and p.slot ~= "m2" then
		return false, why(lang, "laptopa sadece M.2 Wi-Fi kartı takılır", "laptops take M.2 Wi-Fi cards only")
	end
	if p.cat == "storage" and tn.kinds and not table.find(tn.kinds, p.kind) then
		return false, why(lang, "disk tipi bu yuvaya uymuyor", "drive type doesn't fit this bay")
	end
	if dev.kind == "desktop" then
		local mobo = partOf(dev, "mobo")
		local case = caseDef(dev)
		if p.cat == "ram" then
			if p.form ~= "DIMM" then
				return false, why(lang, "laptop RAM'i (SO-DIMM) masaüstüne takılmaz", "laptop SO-DIMM doesn't fit a desktop")
			end
			if mobo and p.mem ~= mobo.mem then
				return false, why(lang, "anakart " .. mobo.mem .. " istiyor", "board needs " .. mobo.mem)
			end
		elseif p.cat == "cpu" then
			if mobo and p.socket ~= mobo.socket then
				return false, why(lang, "soket farklı (" .. mobo.socket .. " lazım)", "different socket (" .. mobo.socket .. " needed)")
			end
		elseif p.cat == "mobo" then
			if case and not Parts.caseFits(case, p.form) then
				return false, why(lang, "kasaya sığmaz (" .. p.form .. ")", "doesn't fit the case (" .. p.form .. ")")
			end
		elseif p.cat == "cooler" then
			local socket = mobo and mobo.socket
			if socket and not Parts.coolerFits(p, socket) then
				return false, why(lang, socket .. " soketine uymuyor", "doesn't fit " .. socket)
			end
			if case and (case.style == "sff" or case.style == "office") and p.kind == "aio" then
				return false, why(lang, "kasada radyatör yeri yok", "no radiator room in this case")
			end
		elseif p.cat == "gpu" then
			if case and p.len > case.gpuMax then
				return false, why(lang, "kart kasaya sığmıyor (" .. p.len .. " cm)", "card too long for the case (" .. p.len .. " cm)")
			end
			if case and case.lowProfileOnly and not p.lowProfile then
				return false, why(lang, "bu kasaya sadece düşük profil kart girer", "this case only fits low-profile cards")
			end
		elseif p.cat == "psu" then
			if case and case.style == "itx" and p.form ~= "SFX" then
				return false, why(lang, "ITX kasa SFX güç kaynağı ister", "ITX case needs an SFX PSU")
			end
		elseif p.cat == "storage" then
			if string.match(id, "^nvme") and p.kind ~= "nvme" then
				return false, why(lang, "M.2 yuvasına NVMe takılır", "M.2 slot takes NVMe")
			end
		elseif p.cat == "case" then
			return false, why(lang, "kasa değiştirilemez", "the case can't be swapped")
		end
	else
		local m = Rules.laptopModel(dev)
		if p.cat == "ram" then
			if p.form ~= "SODIMM" then
				return false, why(lang, "laptop SO-DIMM ister", "laptops need SO-DIMM")
			end
			if m and p.mem ~= m.mem then
				return false, why(lang, "laptop " .. m.mem .. " istiyor", "laptop needs " .. m.mem)
			end
		end
	end
	return true
end

----------------------------------------------------------------------------------------------------
-- Prerequisite helpers
----------------------------------------------------------------------------------------------------
local function sideOk(dev, tn)
	if dev.kind ~= "laptop" then
		return true
	end
	local side = tn.side
	local lidOpen = tn.lidOpen
	if not side and tn.owner then
		local o = tnode(dev, tn.owner)
		side = o and o.side
		lidOpen = lidOpen or (o and o.lidOpen)
	end
	if side == "bottom" and dev.orient ~= "bottom" then
		return false, "flip_bottom"
	end
	if side == "top" then
		if dev.orient ~= "top" then
			return false, "flip_top"
		end
		if lidOpen and dev.lid ~= "open" then
			return false, "lid_open"
		end
	end
	return true
end

local function blocking(dev, list)
	for _, b in list do
		if available(dev, b) then
			local s = st(dev, b)
			if s == "in" or s == "loose" then
				return b
			end
		end
	end
	return nil
end

local function stillPlugged(dev, list)
	for _, c in list do
		if available(dev, c) and st(dev, c) ~= "out" then
			return c
		end
	end
	return nil
end

local function screwsLeft(dev, owner: string): number
	local tn = tnode(dev, owner)
	local n = 0
	for _, sid in tn.screws do
		if available(dev, sid) and st(dev, sid) == "in" then
			n += 1
		end
	end
	return n
end

local function cablesStillIn(dev, owner: string)
	local tn = tnode(dev, owner)
	for _, cid in tn.cables do
		if available(dev, cid) and st(dev, cid) ~= "out" then
			return cid
		end
	end
	return nil
end

local function latchClosed(dev, owner: string)
	local tn = tnode(dev, owner)
	for _, lid in tn.latches do
		if available(dev, lid) and st(dev, lid) ~= "open" then
			return lid
		end
	end
	return nil
end

local MOBO_CHILDREN = { "cpu", "ram1", "ram2", "ram3", "ram4", "nvme1", "nvme2", "cmos", "cooler" }

local function fail(key: string, vars: { [string]: any }?)
	return false, key, vars
end

local function nodeVar(dev, id, ctx)
	return { node = label(dev, id, ctx and ctx.lang), id = id }
end

----------------------------------------------------------------------------------------------------
-- check(): can `action` be done to `target` right now?
-- ctx = { tool = toolId, owned = { [toolId] = true }, lang = "tr"|"en" }
-- args = action specific (install: { source = "self"|"inv"|"used"|"tray", part = id, uid = id })
-- returns ok, reasonKey, reasonVars
----------------------------------------------------------------------------------------------------
local TARGETLESS = {
	flip = true, lid = true, press_power = true, stress = true, software = true, wear_strap = true,
	tie_cables = true, psu_test = true, post_code = true, thermal_view = true, diagnose = true,
}
-- Bench buttons that work whatever tool is in hand.
local UNTOOLED = { press_power = true, stress = true, discard = true, diagnose = true, flip = true, lid = true, tie_cables = true }
Rules.Untooled = UNTOOLED

function Rules.check(dev, action: string, target: string?, args: { [string]: any }?, ctx: { [string]: any }): (boolean, string?, { [string]: any }?)
	args = args or {}
	local toolId = ctx.tool or "hand"
	local tool = Tools.get(toolId)
	if not tool then
		return fail("wrong_tool")
	end
	if toolId ~= "hand" and ctx.owned and not ctx.owned[toolId] then
		return fail("no_tool")
	end
	if not UNTOOLED[action] and not table.find(tool.actions, action) then
		return fail("wrong_tool")
	end

	local tn, s
	if not TARGETLESS[action] then
		if typeof(target) ~= "string" then
			return fail("not_present")
		end
		tn = tnode(dev, target :: string)
		if not tn or not available(dev, target :: string) then
			return fail("not_present")
		end
		s = dev.nodes[target :: string]
	end

	if action == "unscrew" or action == "screw" then
		if tn.kind ~= "screw" then
			return fail("wrong_target")
		end
		local bit = Rules.screwBit(dev, target :: string)
		if not toolBitOk(toolId, bit) then
			return fail("wrong_bit", { bit = bit })
		end
		if action == "unscrew" and s.st ~= "in" then
			return fail("already")
		end
		if action == "screw" then
			if s.st == "in" then
				return fail("already")
			end
			local os = st(dev, tn.owner)
			if os ~= "in" and os ~= "loose" then
				return fail("need_parent", nodeVar(dev, tn.owner, ctx))
			end
		end
		if tn.underFeet and st(dev, "feet") ~= "peeled" then
			return fail("peel_first")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local b = blocking(dev, tn.blockers) or blocking(dev, tnode(dev, tn.owner).blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		return true
	elseif action == "unplug" or action == "plug" then
		if tn.kind ~= "cable" then
			return fail("wrong_target")
		end
		if action == "unplug" and s.st == "out" then
			return fail("already")
		end
		if action == "plug" then
			if s.st == "in" then
				return fail("already")
			end
			for _, e in tn.ends do
				local es = st(dev, e)
				if es ~= "in" then
					return fail("ends_missing")
				end
			end
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		if tn.afterScrews and screwsLeft(dev, tn.afterScrews) > 0 then
			return fail("unscrew_first", { count = screwsLeft(dev, tn.afterScrews), id = tn.afterScrews })
		end
		return true
	elseif action == "open_latch" or action == "close_latch" then
		if tn.kind ~= "latch" then
			return fail("wrong_target")
		end
		if action == "open_latch" and s.st == "open" then
			return fail("already")
		end
		if action == "close_latch" and s.st == "closed" then
			return fail("already")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		return true
	elseif action == "remove" then
		if tn.kind == "feet" then
			return fail("wrong_target")
		end
		if tn.kind ~= "comp" and tn.kind ~= "panel" then
			return fail("wrong_target")
		end
		if s.st == "out" or s.st == "empty" then
			return fail("already")
		end
		if Rules.isSoldered(dev, target :: string) and s.st == "in" then
			return fail("desolder_first")
		end
		if tn.pry and s.st == "in" then
			return fail("pry_first")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		-- reachability first (panels, covers, the battery), then the part's own fasteners
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		local u = stillPlugged(dev, tn.needsUnplugged)
		if u then
			return fail("unplug_first", nodeVar(dev, u, ctx))
		end
		if tn.solder and tn.needsOut and st(dev, tn.needsOut) ~= "out" then
			return fail("board_out_first")
		end
		local left = screwsLeft(dev, target :: string)
		if left > 0 then
			return fail("unscrew_first", { count = left, id = target })
		end
		local c = cablesStillIn(dev, target :: string)
		if c then
			return fail("unplug_first", nodeVar(dev, c, ctx))
		end
		local l = latchClosed(dev, target :: string)
		if l then
			return fail("open_latch_first", nodeVar(dev, l, ctx))
		end
		return true
	elseif action == "install" then
		if tn.kind == "feet" then
			if s.st ~= "peeled" then
				return fail("already")
			end
			local ok, why = sideOk(dev, tn)
			if not ok then
				return fail(why :: string)
			end
			return true
		end
		if tn.kind == "panel" then
			if s.st ~= "out" and s.st ~= "loose" then
				return fail("already")
			end
			local ok, why = sideOk(dev, tn)
			if not ok then
				return fail(why :: string)
			end
			return true
		end
		if tn.kind ~= "comp" then
			return fail("wrong_target")
		end
		local source = args.source
		if source == "self" then
			local pried = tn.pry and s.st == "loose"
			if s.st ~= "out" and not pried then
				return fail(if s.st == "empty" then "nothing_to_install" else "already")
			end
		else
			if s.st == "in" or s.st == "loose" then
				return fail("slot_busy")
			end
			local p = args.part and Parts.get(args.part)
			if not p then
				return fail("nothing_to_install")
			end
			local ok, whyNot = Rules.compatible(dev, target :: string, p, ctx.lang)
			if not ok then
				return fail("incompatible", { why = whyNot })
			end
			if s.st == "out" and target == "mobo" then
				for _, child in MOBO_CHILDREN do
					if st(dev, child) == "in" then
						return fail("children_attached", nodeVar(dev, child, ctx))
					end
				end
			end
		end
		if tn.parent and tn.parent ~= "case" and tn.parent ~= "base" then
			local ps = st(dev, tn.parent)
			if ps == nil or ps == "empty" then
				return fail("need_parent", nodeVar(dev, tn.parent, ctx))
			end
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		local u = stillPlugged(dev, tn.needsUnplugged)
		if u then
			return fail("unplug_first", nodeVar(dev, u, ctx))
		end
		if tn.cat == "ram" or tn.cat == "cpu" then
			local l = latchClosed(dev, target :: string)
			if l then
				return fail("open_latch_first", nodeVar(dev, l, ctx))
			end
		end
		if tn.solder and tn.needsOut and st(dev, tn.needsOut) ~= "out" then
			return fail("board_out_first")
		end
		return true
	elseif action == "discard" then
		if tn.kind ~= "comp" or s.st ~= "out" then
			return fail("already")
		end
		if target == "mobo" then
			for _, child in MOBO_CHILDREN do
				if st(dev, child) == "in" then
					return fail("children_attached", nodeVar(dev, child, ctx))
				end
			end
		end
		return true
	elseif action == "pry" then
		if not tn.pry then
			return fail("wrong_target")
		end
		if s.st ~= "in" then
			return fail("already")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local left = screwsLeft(dev, target :: string)
		if left > 0 then
			-- hidden screws under the feet count too
			return fail("unscrew_first", { count = left, id = target })
		end
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		local u = stillPlugged(dev, tn.needsUnplugged)
		if u then
			return fail("unplug_first", nodeVar(dev, u, ctx))
		end
		return true
	elseif action == "peel" then
		if tn.kind ~= "feet" then
			return fail("wrong_target")
		end
		if s.st ~= "in" then
			return fail("already")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		return true
	elseif action == "flip" then
		if dev.kind ~= "laptop" then
			return fail("not_laptop")
		end
		if dev.lid == "open" then
			return fail("lid_closed")
		end
		return true
	elseif action == "lid" then
		if dev.kind ~= "laptop" then
			return fail("not_laptop")
		end
		if dev.orient ~= "top" then
			return fail("flip_top")
		end
		return true
	elseif action == "clean_paste" or action == "apply_paste" then
		local cpuNode = if dev.kind == "desktop" then "cpu" else "lboard"
		if target ~= cpuNode then
			return fail("wrong_target")
		end
		if dev.kind == "desktop" then
			if st(dev, "cpu") == "empty" then
				return fail("not_present")
			end
			if st(dev, "cooler") == "in" then
				return fail("cooler_off_first")
			end
		else
			if dev.orient ~= "bottom" then
				return fail("flip_bottom")
			end
			if st(dev, "lfan") == "in" then
				return fail("remove_first", nodeVar(dev, "lfan", ctx))
			end
		end
		local p = dev.paste.st
		if action == "clean_paste" then
			if p == "clean" or p == "none" then
				return fail("already")
			end
		else
			if p == "dry" or p == "old" then
				return fail("clean_paste_first")
			end
			if p == "fresh" then
				return fail("already")
			end
		end
		return true
	elseif action == "blow_dust" or action == "brush" then
		if not tn.dusty and target ~= "lboard" then
			return fail("wrong_target")
		end
		if s.st == "empty" then
			return fail("not_present")
		end
		if dev.kind == "desktop" then
			if st(dev, "side_panel") == "in" then
				return fail("remove_first", nodeVar(dev, "side_panel", ctx))
			end
		else
			if dev.orient ~= "bottom" then
				return fail("flip_bottom")
			end
			if st(dev, "bottom_cover") ~= "out" then
				return fail("remove_first", nodeVar(dev, "bottom_cover", ctx))
			end
		end
		local dusty = (s.dust or 0) > 0.02
		local wet = target == "lboard" and (dev.liquid or 0) > 0.02 and action == "brush"
		if not dusty and not wet then
			return fail("no_dust")
		end
		return true
	elseif action == "clean_liquid" then
		if dev.kind ~= "laptop" then
			return fail("not_laptop")
		end
		if target ~= "lboard" and target ~= "keyboard" then
			return fail("wrong_target")
		end
		if dev.orient ~= "bottom" then
			return fail("flip_bottom")
		end
		if st(dev, "bottom_cover") ~= "out" then
			return fail("remove_first", nodeVar(dev, "bottom_cover", ctx))
		end
		if stillPlugged(dev, { "bat_conn" }) then
			return fail("unplug_first", nodeVar(dev, "bat_conn", ctx))
		end
		if (dev.liquid or 0) <= 0.02 then
			return fail("already")
		end
		return true
	elseif action == "desolder" or action == "solder" then
		if not Rules.isSoldered(dev, target :: string) then
			return fail("wrong_target")
		end
		if action == "desolder" and s.st ~= "in" then
			return fail(if s.st == "loose" then "already" else "not_present")
		end
		if action == "solder" then
			if toolId ~= "soldering_station" then
				return fail("wrong_tool")
			end
			if s.st ~= "loose" then
				return fail(if s.st == "in" then "already" else "not_present")
			end
		end
		if tn.needsOut and st(dev, tn.needsOut) ~= "out" then
			return fail("board_out_first")
		end
		local ok, why = sideOk(dev, tn)
		if not ok then
			return fail(why :: string)
		end
		local b = blocking(dev, tn.blockers)
		if b then
			return fail("remove_first", nodeVar(dev, b, ctx))
		end
		local u = stillPlugged(dev, tn.needsUnplugged)
		if u then
			return fail("unplug_first", nodeVar(dev, u, ctx))
		end
		return true
	elseif action == "straighten_pins" then
		if target ~= "socket" then
			return fail("wrong_target")
		end
		if st(dev, "cpu") == "in" then
			return fail("cpu_out_first")
		end
		if s.st ~= "bent" then
			return fail("pins_ok")
		end
		return true
	elseif action == "tie_cables" then
		if dev.kind ~= "desktop" then
			return fail("not_desktop")
		end
		if st(dev, "side_panel") == "in" then
			return fail("remove_first", nodeVar(dev, "side_panel", ctx))
		end
		if dev.ties then
			return fail("already")
		end
		for id, tn2 in tmpl(dev).nodes do
			if tn2.kind == "cable" and available(dev, id) then
				local a, b = st(dev, tn2.ends[1]), st(dev, tn2.ends[2])
				if a == "in" and b == "in" and st(dev, id) ~= "in" then
					return fail("cables_first")
				end
			end
		end
		return true
	elseif action == "inspect" or action == "measure" then
		return true
	elseif action == "software" then
		local prog = args.program
		if prog == "bios_update" then
			if st(dev, "mobo") ~= "in" and dev.kind == "desktop" then
				return fail("board_needed")
			end
			return true
		end
		local r = Rules.evaluate(dev, "post")
		if r.stage ~= "ok" and r.stage ~= "no_boot" and r.stage ~= "no_os" and r.stage ~= "os_error" and r.stage ~= "fan_error" then
			return fail("no_boot_for_usb")
		end
		return true
	elseif action == "psu_test" then
		if dev.kind ~= "desktop" then
			return fail("not_desktop")
		end
		if st(dev, "psu") == "empty" then
			return fail("psu_needed")
		end
		return true
	elseif action == "post_code" then
		if dev.kind ~= "desktop" then
			return fail("not_desktop")
		end
		return true
	end
	return true
end

----------------------------------------------------------------------------------------------------
-- apply(): performs a checked action. Mutates dev and returns a result table.
-- ctx (server) may provide:
--   takePart(source, partId, uid) -> { part, cond, hidden } | nil   (removes from inventory / tray)
--   usePaste() -> quality 0..1 | nil, useSolder() -> bool, useTies(n) -> bool
--   rng (Random) for ESD and intermittent faults
----------------------------------------------------------------------------------------------------
local ESD_SENSITIVE = { gpu = true, cpu = true, mobo = true, ram1 = true, ram2 = true, ram3 = true, ram4 = true, nvme1 = true, nvme2 = true, lram1 = true, lram2 = true, lnvme = true, lwifi = true }

local function newUid(dev): string
	dev.nextUid = (dev.nextUid or 0) + 1
	return "t" .. dev.nextUid
end

local function pushTray(dev, nodeId: string, s)
	local item = { uid = newUid(dev), node = nodeId, part = s.part, cond = s.cond or 1, origin = s.origin or "device", hidden = dev.hidden and dev.hidden[nodeId] or nil }
	table.insert(dev.tray, item)
	if dev.hidden then
		dev.hidden[nodeId] = nil
	end
	s.part = nil
	s.cond = nil
	s.origin = nil
	s.st = "empty"
	return item
end

local function resetBoardFixtures(dev)
	for i = 1, 6 do
		local c = dev.nodes["cap" .. i]
		if c then
			c.st = "in"
			c.part = "cap_470"
			if dev.hidden then
				dev.hidden["cap" .. i] = nil
			end
		end
	end
	if dev.nodes.socket then
		dev.nodes.socket.st = "ok"
	end
	for _, l in { "cpu_arm", "pcie_latch", "ram1_clip", "ram2_clip", "ram3_clip", "ram4_clip" } do
		if dev.nodes[l] then
			dev.nodes[l].st = "closed"
		end
	end
end

local function esdRisk(dev, nodeId: string, ctx)
	if dev.strap or not ESD_SENSITIVE[nodeId] or not ctx.rng or not dev.hidden then
		return nil
	end
	if ctx.rng:NextNumber() < Config.EsdDamageChance then
		dev.hidden[nodeId] = if string.find(nodeId, "ram") then "faulty" else "dead"
		dev.esdEvents = (dev.esdEvents or 0) + 1
		return nodeId
	end
	return nil
end

function Rules.apply(dev, action: string, target: string?, args: { [string]: any }?, ctx: { [string]: any }): { [string]: any }
	args = args or {}
	local ok, reason, vars = Rules.check(dev, action, target, args, ctx)
	if not ok then
		return { ok = false, reason = reason, vars = vars, msg = Rules.message(reason :: string, ctx.lang, vars) }
	end
	local s = target and dev.nodes[target]
	local result: { [string]: any } = { ok = true, action = action, target = target }

	if action == "unscrew" or action == "unplug" then
		s.st = "out"
	elseif action == "screw" or action == "plug" then
		s.st = "in"
	elseif action == "open_latch" then
		s.st = "open"
	elseif action == "close_latch" then
		s.st = "closed"
	elseif action == "remove" then
		s.st = "out"
		result.esd = esdRisk(dev, target :: string, ctx)
	elseif action == "discard" then
		result.tray = pushTray(dev, target :: string, s)
	elseif action == "install" then
		local tn = tnode(dev, target :: string)
		if tn.kind == "panel" or tn.kind == "feet" then
			s.st = "in"
		else
			if args.source ~= "self" then
				local taken = { part = args.part, cond = 1, hidden = nil, origin = args.source }
				if ctx.takePart then
					taken = ctx.takePart(args.source, args.part, args.uid)
					if not taken then
						return { ok = false, reason = "nothing_to_install", msg = Rules.message("nothing_to_install", ctx.lang) }
					end
				end
				if s.st == "out" then
					result.tray = pushTray(dev, target :: string, s)
				end
				if target == "mobo" then
					-- a new board comes with its own capacitors, socket and clips
					resetBoardFixtures(dev)
				end
				s.part = taken.part
				s.cond = taken.cond or 1
				s.origin = taken.origin or args.source
				if dev.hidden then
					dev.hidden[target :: string] = taken.hidden
				end
				local p = Parts.get(taken.part)
				if p and p.cat == "storage" then
					s.os = "none"
					s.virus = 0
				end
				if p and p.cat == "cpu" then
					dev.paste.st = "none"
					dev.paste.q = 0
				end
				if p and p.cat == "cooler" and (dev.paste.st == "clean" or dev.paste.st == "none") then
					-- new coolers ship with pre-applied paste
					dev.paste.st = "fresh"
					dev.paste.q = 0.8
				end
				if target == "mobo" then
					dev.sw.bios = "ok"
				end
			elseif dev.hidden and dev.hidden[target :: string] == "unseated" then
				-- reseating fixes it
				dev.hidden[target :: string] = nil
			end
			s.st = if Rules.isSoldered(dev, target :: string) then "loose" else "in"
			-- clips snap shut when a module is pressed home
			if tn.cat == "ram" then
				for _, l in tn.latches do
					dev.nodes[l].st = "closed"
				end
			elseif target == "gpu" then
				dev.nodes.pcie_latch.st = "closed"
			end
			result.esd = esdRisk(dev, target :: string, ctx)
		end
	elseif action == "pry" then
		local tn = tnode(dev, target :: string)
		s.st = if tn.id == "bezel" then "out" else "loose"
	elseif action == "peel" then
		s.st = "peeled"
	elseif action == "flip" then
		dev.orient = if dev.orient == "top" then "bottom" else "top"
	elseif action == "lid" then
		dev.lid = if dev.lid == "open" then "closed" else "open"
	elseif action == "clean_paste" then
		dev.paste.st = "clean"
		dev.paste.q = 0
	elseif action == "apply_paste" then
		local amount = math.clamp(tonumber(args.amount) or 0.5, 0, 1)
		local brand = 0.85
		if ctx.usePaste then
			local b = ctx.usePaste()
			if not b then
				return { ok = false, reason = "no_paste_left", msg = Rules.message("no_paste_left", ctx.lang) }
			end
			brand = b
		end
		local lo, hi = Config.PasteIdealRange[1], Config.PasteIdealRange[2]
		local spread
		if amount < lo then
			spread = 1 - (lo - amount) / lo * 1.2
		elseif amount > hi then
			spread = 1 - (amount - hi) / (1 - hi) * 0.6
		else
			spread = 1
		end
		dev.paste.st = "fresh"
		dev.paste.q = math.clamp(spread, 0.15, 1) * brand
		result.quality = dev.paste.q
		result.amount = amount
	elseif action == "blow_dust" or action == "brush" then
		local tool = Tools.get(ctx.tool or "air_can")
		local speed = if tool then tool.speed else 1
		local step = if action == "blow_dust" then 0.36 else 0.24
		s.dust = math.max(0, (s.dust or 0) - step * speed)
		if action == "brush" and target == "lboard" then
			dev.liquid = math.max(0, (dev.liquid or 0) - 0.2)
		end
		result.dust = s.dust
	elseif action == "clean_liquid" then
		local tool = Tools.get(ctx.tool or "isopropyl")
		local speed = if tool then tool.speed else 1
		dev.liquid = math.max(0, (dev.liquid or 0) - 0.45 * speed)
		result.liquid = dev.liquid
	elseif action == "desolder" then
		s.st = "loose"
	elseif action == "solder" then
		if ctx.useSolder and not ctx.useSolder() then
			return { ok = false, reason = "no_solder_left", msg = Rules.message("no_solder_left", ctx.lang) }
		end
		s.st = "in"
	elseif action == "straighten_pins" then
		s.st = "ok"
	elseif action == "wear_strap" then
		dev.strap = args.on == true
	elseif action == "tie_cables" then
		if ctx.useTies and not ctx.useTies(4) then
			return { ok = false, reason = "no_ties_left", msg = Rules.message("no_ties_left", ctx.lang) }
		end
		dev.ties = true
	elseif action == "press_power" then
		dev.tests = (dev.tests or 0) + 1
		result.eval = Rules.evaluate(dev, "post")
	elseif action == "stress" then
		dev.tests = (dev.tests or 0) + 1
		result.eval = Rules.evaluate(dev, "stress")
	elseif action == "software" then
		result.software = Rules.runSoftware(dev, args.program, ctx.lang)
	elseif action == "inspect" then
		result.findings = Rules.inspect(dev, target :: string, ctx.lang)
	elseif action == "measure" then
		result.reading = Rules.measure(dev, target :: string, ctx.lang)
	elseif action == "psu_test" then
		result.reading = Rules.psuTest(dev, ctx.lang)
	elseif action == "post_code" then
		local r = Rules.evaluate(dev, "post")
		result.code = r.code
		result.eval = r
	elseif action == "thermal_view" then
		result.eval = Rules.evaluate(dev, "stress")
	end
	return result
end

----------------------------------------------------------------------------------------------------
-- Power-on simulation
----------------------------------------------------------------------------------------------------
local STAGE_TEXT = {
	ok = { tr = "Sistem sorunsuz açıldı.", en = "The system booted fine." },
	no_power = { tr = "Hiçbir tepki yok: fan dönmüyor, ışık yok.", en = "No response: no fans, no lights." },
	no_post = { tr = "Fanlar dönüyor ama sistem POST'u geçemiyor.", en = "Fans spin but the system won't POST." },
	beeps = { tr = "Uzun bip sesleri: bellek algılanmadı.", en = "Long beeps: no memory detected." },
	no_display = { tr = "Sistem çalışıyor ama görüntü yok.", en = "The system runs but there's no picture." },
	fan_error = { tr = "BIOS uyarısı: CPU Fan Error!", en = "BIOS warning: CPU Fan Error!" },
	no_boot = { tr = "\"Boot device not found\" — önyüklenebilir disk yok.", en = "\"Boot device not found\" — no bootable drive." },
	no_os = { tr = "Disk boş: işletim sistemi kurulu değil.", en = "The drive is empty: no operating system." },
	os_error = { tr = "Windows açılmıyor: Otomatik Onarım döngüsü.", en = "Windows won't start: Automatic Repair loop." },
	overheat = { tr = "Aşırı ısınma! Sistem kendini kapattı.", en = "Overheating! The system shut itself down." },
	unstable = { tr = "Yük altında kararsız: test başarısız.", en = "Unstable under load: test failed." },
}
Rules.StageText = STAGE_TEXT

local ISSUE_TEXT = {
	cmos = { tr = "CMOS checksum hatası, saat sıfırlandı.", en = "CMOS checksum error, clock reset." },
	virus = { tr = "Şüpheli işlemler ve reklam pencereleri var.", en = "Suspicious processes and pop-ups." },
	fan_dead = { tr = "Bir kasa fanı dönmüyor.", en = "A case fan isn't spinning." },
	fan_noise = { tr = "Bir fandan tıkırtı geliyor.", en = "A fan is clicking." },
	fan_unplugged = { tr = "Bir fanın kablosu takılı değil.", en = "A fan isn't plugged in." },
	slow_disk = { tr = "Disk çok yavaş ve hata veriyor.", en = "The drive is very slow and throwing errors." },
	artifacts = { tr = "Ekranda renkli artefaktlar var.", en = "Coloured artefacts on screen." },
	dusty = { tr = "İç kısım hâlâ tozlu.", en = "The inside is still dusty." },
	hot = { tr = "Sıcaklıklar bu donanım için anormal yüksek (throttling).", en = "Temperatures are abnormally high for this hardware (throttling)." },
	battery_worn = { tr = "Batarya sağlığı çok düşük.", en = "Battery health is very low." },
	battery_swollen = { tr = "Batarya şişmiş!", en = "The battery is swollen!" },
	screen_broken = { tr = "Ekran paneli kırık / görüntü yok.", en = "The display is cracked / blank." },
	keyboard = { tr = "Bazı tuşlar çalışmıyor.", en = "Some keys don't work." },
	hinge = { tr = "Menteşe kırık.", en = "The hinge is broken." },
	not_charging = { tr = "Adaptör takılıyken şarj olmuyor.", en = "It doesn't charge from the adapter." },
	wifi = { tr = "Wi-Fi kartı algılanmıyor.", en = "No Wi-Fi card detected." },
	liquid = { tr = "Kartta sıvı kalıntısı ve korozyon var.", en = "Liquid residue and corrosion on the board." },
	low_ram = { tr = "Bellek kapasitesi düştü (bir modül çalışmıyor).", en = "Memory capacity dropped (a module isn't working)." },
}
Rules.IssueText = ISSUE_TEXT

local function inN(dev, id)
	return available(dev, id) and st(dev, id) == "in"
end

local function h(dev, id)
	return dev.hidden and dev.hidden[id]
end

local function driveWorks(dev, id): boolean
	if not inN(dev, id) then
		return false
	end
	if h(dev, id) == "dead" then
		return false
	end
	if dev.kind == "desktop" and (id == "ssd1" or id == "hdd1") then
		if st(dev, "csp_" .. id) ~= "in" or st(dev, "csd_" .. id) ~= "in" then
			return false
		end
	end
	if dev.kind == "laptop" and id == "lsata" and st(dev, "lsata_conn") ~= "in" then
		return false
	end
	return true
end
Rules.driveWorks = driveWorks

function Rules.drives(dev): { string }
	return if dev.kind == "desktop" then DESKTOP_DRIVES else LAPTOP_DRIVES
end

-- Installed RAM in GB counting only working modules (plus soldered laptop memory).
function Rules.ramTotal(dev, workingOnly: boolean?): number
	local total = 0
	local ids = if dev.kind == "desktop" then { "ram1", "ram2", "ram3", "ram4" } else { "lram1", "lram2" }
	for _, id in ids do
		if inN(dev, id) then
			local p = partOf(dev, id)
			if p and (not workingOnly or (h(dev, id) ~= "faulty" and h(dev, id) ~= "dead" and h(dev, id) ~= "unseated")) then
				total += p.size
			end
		end
	end
	if dev.kind == "laptop" then
		local m = Rules.laptopModel(dev)
		total += m and m.soldered or 0
	end
	return total
end

-- CPU temperature model shared by the evaluation and the UI's expected-temperature hint.
function Rules.cpuTemp(power: number, rCooler: number, paste, dust: number, workingFans: number): number
	local rPaste
	if paste.st == "fresh" then
		rPaste = 0.035 + (1 - (paste.q or 0.8)) * 0.1
	elseif paste.st == "old" then
		rPaste = 0.07
	elseif paste.st == "dry" then
		rPaste = 0.45
	else
		rPaste = 0.7
	end
	local t = 30 + power * (rCooler * (1 + dust * 0.9) + rPaste)
	if workingFans == 0 then
		t += 5
	end
	return t
end

local function evaluateDesktop(dev, mode: string)
	local r = { stage = "ok", fans = false, rgb = false, code = "A0", issues = {}, temps = {} }
	local function stop(stage, code)
		r.stage = stage
		r.code = code or r.code
		return r
	end
	local psu, mobo = partOf(dev, "psu"), partOf(dev, "mobo")
	if not inN(dev, "psu") or not inN(dev, "mobo") or not psu or not mobo then
		return stop("no_power", "--")
	end
	if st(dev, "c24") ~= "in" or h(dev, "psu") == "dead" then
		return stop("no_power", "--")
	end
	r.fans = true
	local cpu = partOf(dev, "cpu")
	local gpu = inN(dev, "gpu") and partOf(dev, "gpu") or nil
	r.rgb = (gpu ~= nil and gpu.perf > 40) or (partOf(dev, "ram1") ~= nil and partOf(dev, "ram1").rgb == true)
	if st(dev, "ceps") ~= "in" then
		return stop("no_post", "00")
	end
	if h(dev, "mobo") == "dead" then
		return stop("no_post", "00")
	end
	for i = 1, 6 do
		local cid = "cap" .. i
		if dev.nodes[cid] then
			if st(dev, cid) ~= "in" then
				return stop("no_post", "00")
			end
			if h(dev, cid) == "bulged" and ((dev.tests or 0) % 2 == 1 or mode == "stress") then
				return stop(if mode == "stress" then "unstable" else "no_post", "00")
			end
		end
	end
	if not inN(dev, "cpu") or not cpu or h(dev, "cpu") == "dead" then
		return stop("no_post", "00")
	end
	if st(dev, "cpu_arm") ~= "closed" then
		return stop("no_post", "00")
	end
	if st(dev, "socket") == "bent" then
		return stop("beeps", "55")
	end
	if dev.sw.bios == "old" then
		return stop("no_post", "00")
	end
	-- memory
	local sticks, working = 0, 0
	for i = 1, 4 do
		local id = "ram" .. i
		if inN(dev, id) then
			sticks += 1
			local f = h(dev, id)
			if f == "unseated" or st(dev, id .. "_clip") ~= "closed" then
				return stop("beeps", "55")
			end
			if f ~= "dead" then
				working += 1
			end
		end
	end
	if sticks == 0 or working == 0 then
		return stop("beeps", "55")
	end
	-- cooling (BIOS checks the CPU fan header)
	if not inN(dev, "cooler") then
		r.temps.cpu = 105
		return stop("overheat", "A0")
	end
	if st(dev, "cfan_cpu") ~= "in" or h(dev, "cooler") == "fan_dead" then
		return stop("fan_error", "A0")
	end
	-- video
	if gpu then
		for i = 1, #Parts.gpuConnectors(gpu) do
			if st(dev, "cpcie" .. i) ~= "in" then
				return stop("no_display", "d6")
			end
		end
		if h(dev, "gpu") == "dead" then
			return stop("no_display", "d6")
		end
	elseif not (cpu.igpu and mobo.video) then
		return stop("no_display", "d6")
	end
	-- boot drive
	local boot = dev.boot
	if not boot or not driveWorks(dev, boot) then
		boot = nil
		for _, d in DESKTOP_DRIVES do
			if driveWorks(dev, d) and dev.nodes[d].os and dev.nodes[d].os ~= "none" then
				boot = d
				break
			end
		end
	end
	if not boot then
		local anyDrive = false
		for _, d in DESKTOP_DRIVES do
			if driveWorks(dev, d) then
				anyDrive = true
			end
		end
		return stop(if anyDrive then "no_os" else "no_boot", "A2")
	end
	local bootState = dev.nodes[boot]
	if bootState.os == "corrupt" then
		return stop("os_error", "A0")
	end
	if h(dev, boot) == "failing" then
		table.insert(r.issues, "slow_disk")
	end
	if (bootState.virus or 0) > 0 then
		table.insert(r.issues, "virus")
	end
	r.boot = boot

	-- non-fatal checks
	if not inN(dev, "cmos") or h(dev, "cmos") == "low" then
		table.insert(r.issues, "cmos")
	end
	if working < sticks then
		table.insert(r.issues, "low_ram")
	end
	local workingFans = 0
	for _, fid in FAN_ORDER do
		if inN(dev, fid) then
			local f = h(dev, fid)
			if st(dev, "cfan_" .. fid) ~= "in" then
				table.insert(r.issues, "fan_unplugged")
			elseif f == "dead" then
				table.insert(r.issues, "fan_dead")
			else
				workingFans += 1
				if f == "noisy" then
					table.insert(r.issues, "fan_noise")
				end
			end
		end
	end
	if gpu and h(dev, "gpu") == "artifacts" then
		table.insert(r.issues, "artifacts")
	end
	local dustMax = 0
	for id, s in dev.nodes do
		if s.dust and available(dev, id) and s.st ~= "empty" then
			dustMax = math.max(dustMax, s.dust)
		end
	end
	if dustMax > 0.25 then
		table.insert(r.issues, "dusty")
	end

	-- thermals: temperature rise = power x (cooler resistance + paste resistance)
	local cooler = partOf(dev, "cooler")
	local power = cpu.tdp
	local rCooler = 40 / math.max(cooler and cooler.rating or 60, 1)
	local coolerDust = (dev.nodes.cooler and dev.nodes.cooler.dust) or 0
	local cpuTemp = Rules.cpuTemp(power, rCooler, dev.paste, coolerDust, workingFans)
	local expected = Rules.cpuTemp(power, rCooler, { st = "fresh", q = 0.85 }, 0, math.max(workingFans, 1))
	local gpuTemp, gpuExpected = 0, 0
	if gpu then
		local gpuDust = (dev.nodes.gpu and dev.nodes.gpu.dust) or 0
		gpuTemp = 44 + gpu.tdp * 0.07 + gpuDust * 32
		gpuExpected = 44 + gpu.tdp * 0.07
	end
	if mode ~= "stress" then
		cpuTemp = 30 + (cpuTemp - 30) * 0.45
		expected = 30 + (expected - 30) * 0.45
		gpuTemp = if gpu then 32 + (gpuTemp - 32) * 0.4 else 0
		gpuExpected = if gpu then 32 + (gpuExpected - 32) * 0.4 else 0
	end
	r.temps.cpu = math.floor(cpuTemp + 0.5)
	r.temps.cpuExpected = math.floor(expected + 0.5)
	if gpu then
		r.temps.gpu = math.floor(gpuTemp + 0.5)
	end
	if cpuTemp > 100 or gpuTemp > 95 then
		return stop("overheat", "A0")
	end
	-- a technician notices temperatures far above what this hardware should run at
	if mode == "stress" and (cpuTemp - expected > 15 or (gpu and gpuTemp - gpuExpected > 18)) then
		table.insert(r.issues, "hot")
	end
	if mode == "stress" then
		local draw = Parts.systemDraw(cpu, gpu)
		r.draw = draw
		if h(dev, "psu") == "weak" or psu.watt < draw * 1.05 then
			return stop("unstable", "A0")
		end
		if working < sticks then
			return stop("unstable", "A0")
		end
		if gpu and h(dev, "gpu") == "artifacts" then
			return stop("unstable", "A0")
		end
		if h(dev, boot) == "failing" then
			return stop("unstable", "A0")
		end
		for i = 1, 4 do
			if inN(dev, "ram" .. i) and h(dev, "ram" .. i) == "faulty" then
				return stop("unstable", "A0")
			end
		end
	end
	return r
end

local function evaluateLaptop(dev, mode: string)
	local r = { stage = "ok", fans = false, rgb = false, code = "A0", issues = {}, temps = {} }
	local function stop(stage, code)
		r.stage = stage
		r.code = code or r.code
		return r
	end
	local m = Rules.laptopModel(dev)
	local charger = inN(dev, "dcjack") and h(dev, "dcjack") ~= "dead" and (Rules.isSoldered(dev, "dcjack") or st(dev, "dc_conn") == "in")
	local battery = inN(dev, "battery") and st(dev, "bat_conn") == "in" and h(dev, "battery") ~= "dead"
	if not charger and not battery then
		return stop("no_power", "--")
	end
	if (dev.liquid or 0) > 0.3 then
		return stop("no_power", "--")
	end
	r.fans = inN(dev, "lfan")
	local memory = Rules.ramTotal(dev, false)
	if memory <= 0 then
		return stop("beeps", "55")
	end
	for i = 1, 2 do
		local id = "lram" .. i
		if inN(dev, id) and (h(dev, id) == "unseated" or st(dev, id .. "_clip") ~= "closed") then
			return stop("beeps", "55")
		end
	end
	if not inN(dev, "lfan") then
		r.temps.cpu = 104
		return stop("overheat", "A0")
	end
	if st(dev, "lfan_conn") ~= "in" then
		return stop("fan_error", "A0")
	end
	-- the bench monitor is plugged into HDMI, so a broken panel is an issue, not a blank test
	if not inN(dev, "screen") or st(dev, "edp_conn") ~= "in" or h(dev, "screen") == "cracked" then
		table.insert(r.issues, "screen_broken")
	end
	local boot = dev.boot
	if not boot or not driveWorks(dev, boot) then
		boot = nil
		for _, d in LAPTOP_DRIVES do
			if driveWorks(dev, d) and dev.nodes[d].os and dev.nodes[d].os ~= "none" then
				boot = d
				break
			end
		end
	end
	if not boot then
		local anyDrive = false
		for _, d in LAPTOP_DRIVES do
			if driveWorks(dev, d) then
				anyDrive = true
			end
		end
		return stop(if anyDrive then "no_os" else "no_boot", "A2")
	end
	r.boot = boot
	if dev.nodes[boot].os == "corrupt" then
		return stop("os_error", "A0")
	end
	if h(dev, boot) == "failing" then
		table.insert(r.issues, "slow_disk")
	end
	if (dev.nodes[boot].virus or 0) > 0 then
		table.insert(r.issues, "virus")
	end
	if not inN(dev, "lcmos") or st(dev, "lcmos_conn") ~= "in" or h(dev, "lcmos") == "low" then
		table.insert(r.issues, "cmos")
	end
	local bh = h(dev, "battery")
	if not inN(dev, "battery") or st(dev, "bat_conn") ~= "in" or bh == "worn" or bh == "dead" then
		table.insert(r.issues, "battery_worn")
	elseif bh == "swollen" then
		table.insert(r.issues, "battery_swollen")
	end
	if not charger then
		table.insert(r.issues, "not_charging")
	end
	if not inN(dev, "keyboard") or st(dev, "kb_ribbon") ~= "in" or h(dev, "keyboard") == "dead_keys" then
		table.insert(r.issues, "keyboard")
	end
	if not inN(dev, "hinges") or h(dev, "hinges") == "broken" then
		table.insert(r.issues, "hinge")
	end
	if not inN(dev, "lwifi") or st(dev, "lwifi_ant") ~= "in" or h(dev, "lwifi") == "dead" then
		table.insert(r.issues, "wifi")
	end
	if (dev.liquid or 0) > 0.02 then
		table.insert(r.issues, "liquid")
	end
	if h(dev, "lfan") == "noisy" then
		table.insert(r.issues, "fan_noise")
	end
	local fanDust = (dev.nodes.lfan and dev.nodes.lfan.dust) or 0
	if fanDust > 0.25 then
		table.insert(r.issues, "dusty")
	end
	local gaming = m and (m.class == "gaming15" or m.class == "gaming17")
	local power = if gaming then 95 else 28
	local rCooler = if gaming then 0.42 else 1.1
	local cpuTemp = Rules.cpuTemp(power, rCooler, dev.paste, fanDust, 1)
	local expected = Rules.cpuTemp(power, rCooler, { st = "fresh", q = 0.85 }, 0, 1)
	if mode ~= "stress" then
		cpuTemp = 35 + (cpuTemp - 35) * 0.45
		expected = 35 + (expected - 35) * 0.45
	end
	r.temps.cpu = math.floor(cpuTemp + 0.5)
	r.temps.cpuExpected = math.floor(expected + 0.5)
	if cpuTemp > 100 then
		return stop("overheat", "A0")
	end
	if mode == "stress" and cpuTemp - expected > 12 then
		table.insert(r.issues, "hot")
	end
	if mode == "stress" then
		for i = 1, 2 do
			local id = "lram" .. i
			if inN(dev, id) and h(dev, id) == "faulty" then
				return stop("unstable", "A0")
			end
		end
		if h(dev, boot) == "failing" then
			return stop("unstable", "A0")
		end
	end
	return r
end

-- mode = "post" (power on and boot) or "stress" (full load test)
function Rules.evaluate(dev, mode: string?)
	local m = mode or "post"
	if dev.kind == "desktop" then
		return evaluateDesktop(dev, m)
	end
	return evaluateLaptop(dev, m)
end

----------------------------------------------------------------------------------------------------
-- Assembly / completion
----------------------------------------------------------------------------------------------------
-- Returns ok, list of { id, why } describing what is still open/missing.
function Rules.assembled(dev): (boolean, { { [string]: any } })
	local missing = {}
	local T = tmpl(dev)
	for _, id in T.order do
		local tn = T.nodes[id]
		if available(dev, id) then
			local s = dev.nodes[id]
			if tn.kind == "comp" then
				local mustHave = table.find(T.required, id) ~= nil or (dev.orig and dev.orig[id])
				if s.st == "out" then
					table.insert(missing, { id = id, why = "out" })
				elseif s.st == "loose" then
					table.insert(missing, { id = id, why = if Rules.isSoldered(dev, id) then "solder" else "loose" })
				elseif s.st == "empty" and mustHave then
					table.insert(missing, { id = id, why = "empty" })
				end
			elseif tn.kind == "panel" then
				if s.st ~= "in" then
					table.insert(missing, { id = id, why = "panel" })
				end
			elseif tn.kind == "screw" then
				local os = st(dev, tn.owner)
				if (os == "in") and s.st ~= "in" then
					table.insert(missing, { id = id, why = "screw" })
				end
			elseif tn.kind == "cable" then
				if st(dev, tn.ends[1]) == "in" and st(dev, tn.ends[2]) == "in" and s.st ~= "in" then
					table.insert(missing, { id = id, why = "cable" })
				end
			elseif tn.kind == "latch" then
				if st(dev, tn.owner) == "in" and s.st ~= "closed" then
					table.insert(missing, { id = id, why = "latch" })
				end
			elseif tn.kind == "feet" then
				if s.st ~= "in" then
					table.insert(missing, { id = id, why = "feet" })
				end
			end
		end
	end
	if dev.kind == "desktop" then
		local any = false
		for i = 1, 4 do
			if inN(dev, "ram" .. i) then
				any = true
			end
		end
		if not any then
			table.insert(missing, { id = "ram1", why = "empty" })
		end
	end
	return #missing == 0, missing
end

----------------------------------------------------------------------------------------------------
-- Diagnostics
----------------------------------------------------------------------------------------------------
local function T2(lang, tr, en)
	return if lang == "en" then en else tr
end

function Rules.inspect(dev, target: string, lang: string?): { string }
	local out = {}
	local tn = tnode(dev, target)
	local s = dev.nodes[target]
	if not tn or not s then
		return { T2(lang, "Bakılacak bir şey yok.", "Nothing to look at.") }
	end
	local f = h(dev, target)
	if s.dust and s.dust > 0.15 then
		table.insert(out, T2(lang, string.format("Toz tabakası: %%%d", math.floor(s.dust * 100)), string.format("Dust layer: %d%%", math.floor(s.dust * 100))))
	end
	if target == "mobo" or (tn.parent == "mobo" and tn.solder) then
		for i = 1, 6 do
			if h(dev, "cap" .. i) == "bulged" then
				table.insert(out, T2(lang, "C" .. (40 + i) .. " kondansatörünün tepesi şişmiş ve kahverengi sızıntı var!", "Capacitor C" .. (40 + i) .. " has a bulged top and brown leakage!"))
			end
		end
		if f == "dead" then
			table.insert(out, T2(lang, "VRM bölgesinde küçük bir yanık izi var.", "A small burn mark near the VRM."))
		end
	end
	if target == "socket" then
		if s.st == "bent" then
			table.insert(out, T2(lang, "Soketin ortasında birkaç pin eğilmiş!", "Several pins in the middle of the socket are bent!"))
		elseif st(dev, "cpu") == "in" then
			table.insert(out, T2(lang, "Pinleri görmek için işlemciyi çıkarmalısın.", "Remove the CPU to see the pins."))
		end
	end
	if target == "cpu" or target == "lboard" then
		local covered = (dev.kind == "desktop" and st(dev, "cooler") == "in") or (dev.kind == "laptop" and st(dev, "lfan") == "in")
		if covered then
			table.insert(out, T2(lang, "Termal macunu görmek için soğutucuyu çıkar.", "Remove the cooler to see the paste."))
		else
			local p = dev.paste.st
			if p == "dry" then
				table.insert(out, T2(lang, "Termal macun kurumuş, çatlamış ve tebeşir gibi.", "The paste is dried out, cracked and chalky."))
			elseif p == "old" then
				table.insert(out, T2(lang, "Macun eski ama kullanılabilir.", "The paste is old but usable."))
			elseif p == "none" or p == "clean" then
				table.insert(out, T2(lang, "İşlemcinin üstünde macun yok.", "There's no paste on the CPU."))
			elseif p == "fresh" then
				table.insert(out, T2(lang, "Taze macun sürülmüş.", "Fresh paste applied."))
			end
		end
	end
	if target == "lboard" and (dev.liquid or 0) > 0.02 then
		table.insert(out, T2(lang, "Kartta yapışkan sıvı izi ve yeşil korozyon var.", "Sticky residue and green corrosion on the board."))
	end
	if string.match(target, "ram%d") then
		if f == "unseated" then
			table.insert(out, T2(lang, "Modül yuvaya tam oturmamış, bir ucu havada.", "The module isn't fully seated; one end is raised."))
		elseif f == "faulty" then
			table.insert(out, T2(lang, "Dışarıdan bakınca sağlam görünüyor. Bellek testi yap.", "Looks fine from outside. Run a memory test."))
		end
	end
	if tn.kind == "cable" and s.st == "loose" then
		table.insert(out, T2(lang, "Konnektör yarıya kadar takılı, mandalı oturmamış!", "The plug is only half in; the latch isn't engaged!"))
	end
	if tn.kind == "comp" then
		for _, cid in tn.cables do
			if dev.nodes[cid] and dev.nodes[cid].st == "loose" then
				table.insert(out, T2(lang, label(dev, cid, lang) .. " gevşek görünüyor.", label(dev, cid, lang) .. " looks loose."))
			end
		end
	end
	if target == "gpu" and f == "dead" then
		table.insert(out, T2(lang, "Kartın arka yüzünde bir mosfet kararmış.", "A MOSFET on the back of the card is blackened."))
	elseif target == "gpu" and f == "artifacts" then
		table.insert(out, T2(lang, "Bellek çiplerinin etrafında ısı lekeleri var.", "Heat stains around the memory chips."))
	end
	if target == "psu" and f == "dead" then
		table.insert(out, T2(lang, "PSU'dan hafif yanık kokusu geliyor.", "A faint burnt smell from the PSU."))
	end
	if target == "battery" then
		if f == "swollen" then
			table.insert(out, T2(lang, "Batarya şişmiş! Delmeden, bükmeden çıkar.", "The battery is swollen! Don't puncture or bend it."))
		elseif f == "worn" then
			table.insert(out, T2(lang, "Batarya etiketi 2019 tarihli, çok yaşlı.", "The battery label is dated 2019 — very old."))
		end
	end
	if target == "screen" and f == "cracked" then
		table.insert(out, T2(lang, "Panel köşeden ortaya doğru çatlamış.", "The panel is cracked from the corner inward."))
	end
	if target == "keyboard" and f == "dead_keys" then
		table.insert(out, T2(lang, "Tuşların altında kurumuş şekerli çay var.", "Dried sweet tea under the keys."))
	end
	if target == "hinges" and f == "broken" then
		table.insert(out, T2(lang, "Sol menteşenin bağlantısı kırılmış.", "The left hinge mount has snapped."))
	end
	if target == "dcjack" and f == "dead" then
		table.insert(out, T2(lang, "Soketin içindeki pin kırık ve oynuyor.", "The centre pin inside the jack is broken and loose."))
	end
	if (target == "lfan" or string.match(target, "^fan_")) and f == "noisy" then
		table.insert(out, T2(lang, "Fan pervanesi elle çevirince takılıyor, yatak bitmiş.", "The fan catches when spun by hand; the bearing is worn."))
	end
	if (target == "lfan" or string.match(target, "^fan_")) and f == "dead" then
		table.insert(out, T2(lang, "Fan motoru hiç dönmüyor.", "The fan motor doesn't turn at all."))
	end
	if #out == 0 then
		table.insert(out, T2(lang, "Gözle görülür bir sorun yok.", "Nothing visibly wrong."))
	end
	return out
end

function Rules.measure(dev, target: string, lang: string?): string
	local f = h(dev, target)
	if target == "psu" or target == "c24" then
		local pf = h(dev, "psu")
		if st(dev, "psu") == "empty" then
			return T2(lang, "PSU yok.", "No PSU.")
		end
		if pf == "dead" then
			return "12V: 0.00V • 5V: 0.00V • 3.3V: 0.00V • 5VSB: 0.00V"
		elseif pf == "weak" then
			return T2(lang, "12V: 11.24V (düşük!) • 5V: 4.81V • 3.3V: 3.22V", "12V: 11.24V (low!) • 5V: 4.81V • 3.3V: 3.22V")
		end
		return "12V: 12.06V • 5V: 5.03V • 3.3V: 3.31V • 5VSB: 5.01V"
	elseif target == "cmos" or target == "lcmos" then
		if st(dev, target) == "empty" then
			return T2(lang, "Pil yok.", "No battery.")
		end
		return if f == "low" then T2(lang, "2.31V (düşük — 3V olmalı)", "2.31V (low — should be 3V)") else "3.02V"
	elseif string.match(target, "^cap%d") then
		if st(dev, target) ~= "in" and st(dev, target) ~= "loose" then
			return T2(lang, "Kondansatör yok.", "No capacitor.")
		end
		return if f == "bulged" then T2(lang, "Kapasitans 118µF (470µF olmalı) — ARIZALI", "Capacitance 118µF (should be 470µF) — FAILED") else "466µF"
	elseif target == "battery" then
		if f == "dead" then
			return "0.42V"
		elseif f == "worn" then
			return T2(lang, "10.9V — tasarım kapasitesinin %31'i", "10.9V — 31% of design capacity")
		elseif f == "swollen" then
			return T2(lang, "11.1V — hücreler dengesiz!", "11.1V — cells unbalanced!")
		end
		return "12.4V"
	elseif target == "dcjack" then
		return if f == "dead" then T2(lang, "0.0V (soketten akım geçmiyor)", "0.0V (no current through the jack)") else "19.5V"
	end
	return T2(lang, "Burada ölçülecek anlamlı bir değer yok.", "Nothing meaningful to measure here.")
end

function Rules.psuTest(dev, lang: string?): string
	local f = h(dev, "psu")
	if f == "dead" then
		return T2(lang, "PG: YOK • 12V 0.0 • 5V 0.0 • 3.3V 0.0 — PSU ARIZALI", "PG: NONE • 12V 0.0 • 5V 0.0 • 3.3V 0.0 — PSU FAILED")
	elseif f == "weak" then
		return T2(lang, "PG: 380ms • 12V 11.3 (dalgalı) • 5V 4.8 — ZAYIF", "PG: 380ms • 12V 11.3 (ripple) • 5V 4.8 — WEAK")
	end
	return T2(lang, "PG: 250ms • 12V 12.1 • 5V 5.0 • 3.3V 3.3 — SAĞLAM", "PG: 250ms • 12V 12.1 • 5V 5.0 • 3.3V 3.3 — OK")
end

-- POST code meanings shown next to the 2-digit display
Rules.PostCodes = {
	["--"] = { tr = "Güç yok", en = "No power" },
	["00"] = { tr = "İşlemci / anakart başlatılamadı", en = "CPU / board init failed" },
	["55"] = { tr = "Bellek algılanmadı", en = "Memory not detected" },
	["d6"] = { tr = "Görüntü cihazı yok (VGA)", en = "No console output device (VGA)" },
	["A2"] = { tr = "Önyükleme diski bulunamadı", en = "Boot device not found" },
	["A0"] = { tr = "İşletim sistemine geçildi", en = "Handed over to the OS" },
}

function Rules.runSoftware(dev, program: string, lang: string?): { [string]: any }
	local out = { program = program, ok = true, lines = {} }
	local function line(tr, en)
		table.insert(out.lines, T2(lang, tr, en))
	end
	if program == "memtest" then
		local bad = false
		local ids = if dev.kind == "desktop" then { "ram1", "ram2", "ram3", "ram4" } else { "lram1", "lram2" }
		for i, id in ids do
			if inN(dev, id) then
				if h(dev, id) == "faulty" then
					bad = true
					line(string.format("DIMM %d: 1.204 HATA!", i), string.format("DIMM %d: 1,204 ERRORS!", i))
				else
					line(string.format("DIMM %d: geçti", i), string.format("DIMM %d: pass", i))
				end
			end
		end
		if not bad then
			line("Bellek testi temiz.", "Memory test clean.")
		end
		out.found = bad
	elseif program == "smart" then
		local any = false
		for _, d in Rules.drives(dev) do
			if inN(dev, d) then
				any = true
				local p = partOf(dev, d)
				local name = p and p.name or d
				local f = h(dev, d)
				if f == "failing" then
					line(name .. ": Yeniden atanmış sektör 1832 — DİSK ÖLÜYOR", name .. ": Reallocated sectors 1832 — DRIVE FAILING")
					out.found = true
				elseif f == "dead" then
					line(name .. ": yanıt vermiyor", name .. ": not responding")
					out.found = true
				else
					line(name .. ": Sağlık İyi (%97)", name .. ": Health Good (97%)")
				end
			end
		end
		if not any then
			line("Disk bulunamadı.", "No drives found.")
		end
	elseif program == "antivirus" then
		local boot = dev.boot
		local s = boot and dev.nodes[boot]
		if s and (s.virus or 0) > 0 then
			line(string.format("%d tehdit bulundu ve temizlendi.", s.virus), string.format("%d threats found and removed.", s.virus))
			out.removed = s.virus
			s.virus = 0
			out.found = true
		else
			line("Tehdit bulunamadı.", "No threats found.")
		end
	elseif program == "os_install" then
		-- install onto the fastest healthy drive
		local best, bestSpeed = nil, -1
		for _, d in Rules.drives(dev) do
			if driveWorks(dev, d) and h(dev, d) ~= "failing" then
				local p = partOf(dev, d)
				if p and p.speed > bestSpeed then
					best, bestSpeed = d, p.speed
				end
			end
		end
		if not best then
			out.ok = false
			line("Kurulum için sağlam bir disk yok.", "No healthy drive to install to.")
		else
			dev.nodes[best].os = "ok"
			dev.nodes[best].virus = 0
			dev.boot = best
			out.drive = best
			line("Windows 11 kuruldu, sürücüler yüklendi.", "Windows 11 installed, drivers loaded.")
		end
	elseif program == "bios_update" then
		if dev.sw.bios == "old" then
			dev.sw.bios = "ok"
			line("BIOS Flashback: güncelleme tamam, yeni işlemci destekleniyor.", "BIOS Flashback: update complete, new CPU supported.")
			out.found = true
		else
			line("BIOS zaten güncel.", "BIOS already up to date.")
		end
	elseif program == "battery_report" then
		local f = h(dev, "battery")
		if f == "worn" or f == "dead" then
			line("Batarya sağlığı: %31 — değiştirilmeli.", "Battery health: 31% — replace it.")
			out.found = true
		elseif f == "swollen" then
			line("Batarya hücreleri dengesiz, şişme riski!", "Battery cells unbalanced, swelling risk!")
			out.found = true
		else
			line("Batarya sağlığı: %94", "Battery health: 94%")
		end
	elseif program == "keyboard_test" then
		if h(dev, "keyboard") == "dead_keys" then
			line("Çalışmayan tuşlar: A S D F J K L Ş", "Dead keys: A S D F J K L ;")
			out.found = true
		else
			line("Tüm tuşlar çalışıyor.", "All keys work.")
		end
	else
		out.ok = false
		line("Bilinmeyen program.", "Unknown program.")
	end
	return out
end

----------------------------------------------------------------------------------------------------
-- Client view (no hidden faults)
----------------------------------------------------------------------------------------------------
local function deepCopy(t)
	local c = {}
	for k, v in t do
		c[k] = if type(v) == "table" then deepCopy(v) else v
	end
	return c
end
Rules.deepCopy = deepCopy

function Rules.view(dev)
	local v = {}
	for k, val in dev do
		if k ~= "hidden" and k ~= "faults" and k ~= "requests" then
			v[k] = if type(val) == "table" then deepCopy(val) else val
		end
	end
	if v.tray then
		for _, item in v.tray do
			item.hidden = nil
		end
	end
	-- Visible symptoms the model must render even though the cause is hidden
	v.visible = {}
	if dev.hidden then
		for id, f in dev.hidden do
			if f == "bulged" or f == "cracked" or f == "swollen" or f == "unseated" or f == "broken" or f == "noisy" or f == "dead_keys" then
				v.visible[id] = f
			end
		end
	end
	return v
end

return Rules
