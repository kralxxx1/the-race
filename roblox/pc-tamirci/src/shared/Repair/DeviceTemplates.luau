-- DeviceTemplates: the static node graph of a desktop PC and of a laptop.
--
-- Node kinds
--   comp   a component slot that holds a part (gpu, ram1, psu, battery, screen...)
--   panel  a removable cover (side panel, laptop bottom cover, bezel)
--   screw  a fastener; `owner` is the node it holds, `bit` the screwdriver head
--   cable  a connector; `ends` are the two nodes it joins
--   latch  a clip/lever (RAM clips, PCIe latch, CPU retention arm)
--   (capacitors are comps with solder = true: desolder -> remove -> install -> solder)
--   pins   the CPU socket pins (can be bent)
--   feet   laptop rubber feet hiding screws
--   board  the laptop logic board (inspection / liquid cleaning only)
--
-- Relationships
--   parent          the node this one is mounted on (moves with it)
--   blockers        nodes that must be removed (st ~= "in") first
--   needsUnplugged  cables that must be unplugged first (laptop battery!)
--   side            laptop: "bottom" (needs the laptop flipped) or "top" (needs it upright, lid open)
--   esd             touching it without a wrist strap can kill it
--
-- Which nodes are actually present depends on the installed parts; see RepairRules.available().

local Templates = {}

local function L(tr: string, en: string)
	return { tr = tr, en = en }
end

local function addNode(t, node)
	assert(not t.nodes[node.id], "duplicate node " .. node.id)
	t.nodes[node.id] = node
	table.insert(t.order, node.id)
	node.screws = node.screws or {}
	node.cables = node.cables or {}
	node.latches = node.latches or {}
	node.blockers = node.blockers or {}
	node.needsUnplugged = node.needsUnplugged or {}
	return node
end

local function addScrews(t, owner: string, prefix: string, count: number, bit: string, label, extra: { [string]: any }?)
	local ids = {}
	for i = 1, count do
		local id = prefix .. i
		local n = addNode(t, { id = id, kind = "screw", owner = owner, bit = bit, label = label, index = i })
		if extra then
			for k, v in extra do
				n[k] = v
			end
		end
		table.insert(ids, id)
	end
	t.nodes[owner].screws = ids
	return ids
end

----------------------------------------------------------------------------------------------------
-- Desktop
----------------------------------------------------------------------------------------------------
local function buildDesktop()
	local t = { kind = "desktop", nodes = {}, order = {} }

	addNode(t, { id = "case", kind = "root", label = L("Kasa", "Case"), cat = "case" })
	addNode(t, { id = "side_panel", kind = "panel", parent = "case", label = L("Yan Kapak", "Side Panel") })
	addScrews(t, "side_panel", "sp_s", 4, "thumb", L("Kapak Vidası", "Panel Screw"))

	addNode(t, { id = "psu", kind = "comp", parent = "case", cat = "psu", label = L("Güç Kaynağı (PSU)", "Power Supply"), blockers = { "side_panel" }, dusty = true })
	addScrews(t, "psu", "psu_s", 4, "PH2", L("PSU Vidası", "PSU Screw"))

	addNode(t, { id = "mobo", kind = "comp", parent = "case", cat = "mobo", label = L("Anakart", "Motherboard"), blockers = { "side_panel", "gpu", "cooler" }, esd = true })
	addScrews(t, "mobo", "mb_s", 6, "PH2", L("Anakart Vidası", "Motherboard Screw"))

	addNode(t, { id = "socket", kind = "pins", parent = "mobo", label = L("İşlemci Soketi", "CPU Socket"), blockers = { "cpu" } })
	addNode(t, { id = "cpu", kind = "comp", parent = "mobo", cat = "cpu", label = L("İşlemci", "Processor"), blockers = { "side_panel", "cooler" }, esd = true })
	addNode(t, { id = "cpu_arm", kind = "latch", owner = "cpu", parent = "mobo", label = L("Soket Kolu", "Retention Arm"), blockers = { "cooler" } })
	t.nodes.cpu.latches = { "cpu_arm" }

	addNode(t, { id = "cooler", kind = "comp", parent = "mobo", cat = "cooler", label = L("İşlemci Soğutucu", "CPU Cooler"), blockers = { "side_panel" }, dusty = true })
	addScrews(t, "cooler", "cool_s", 4, "PH2", L("Soğutucu Vidası", "Cooler Screw"))

	for i = 1, 4 do
		local id = "ram" .. i
		addNode(t, { id = id, kind = "comp", parent = "mobo", cat = "ram", form = "DIMM", label = L("RAM Yuvası " .. i, "RAM Slot " .. i), blockers = { "side_panel" }, esd = true, optional = i > 1, index = i })
		addNode(t, { id = id .. "_clip", kind = "latch", owner = id, parent = "mobo", label = L("RAM Mandalı " .. i, "RAM Clip " .. i), blockers = { "side_panel" } })
		t.nodes[id].latches = { id .. "_clip" }
	end

	addNode(t, { id = "gpu", kind = "comp", parent = "case", cat = "gpu", label = L("Ekran Kartı", "Graphics Card"), blockers = { "side_panel" }, esd = true, optional = true, dusty = true })
	addScrews(t, "gpu", "gpu_s", 2, "PH2", L("Braket Vidası", "Bracket Screw"))
	addNode(t, { id = "pcie_latch", kind = "latch", owner = "gpu", parent = "mobo", label = L("PCIe Mandalı", "PCIe Latch"), blockers = { "side_panel" } })
	t.nodes.gpu.latches = { "pcie_latch" }

	addNode(t, { id = "nvme1", kind = "comp", parent = "mobo", cat = "storage", kinds = { "nvme" }, label = L("M.2 Yuvası 1", "M.2 Slot 1"), blockers = { "side_panel" }, esd = true, optional = true, index = 1 })
	addScrews(t, "nvme1", "nv1_s", 1, "PH1", L("M.2 Vidası", "M.2 Screw"))
	addNode(t, { id = "nvme2", kind = "comp", parent = "mobo", cat = "storage", kinds = { "nvme" }, label = L("M.2 Yuvası 2", "M.2 Slot 2"), blockers = { "side_panel", "gpu" }, esd = true, optional = true, index = 2 })
	addScrews(t, "nvme2", "nv2_s", 1, "PH1", L("M.2 Vidası", "M.2 Screw"))

	addNode(t, { id = "hdd1", kind = "comp", parent = "case", cat = "storage", kinds = { "hdd35", "hdd25", "ssd25" }, label = L("3.5\" Disk Yuvası", "3.5\" Drive Bay"), blockers = { "side_panel" }, optional = true })
	addScrews(t, "hdd1", "hdd1_s", 2, "PH2", L("Disk Vidası", "Drive Screw"))
	addNode(t, { id = "ssd1", kind = "comp", parent = "case", cat = "storage", kinds = { "ssd25", "hdd25" }, label = L("2.5\" SSD Yuvası", "2.5\" SSD Mount"), blockers = { "side_panel" }, optional = true })
	addScrews(t, "ssd1", "ssd1_s", 2, "PH2", L("SSD Vidası", "SSD Screw"))

	addNode(t, { id = "cmos", kind = "comp", parent = "mobo", cat = "misc", sub = "cmos", label = L("BIOS Pili", "CMOS Battery"), blockers = { "side_panel", "gpu" } })

	-- VRM capacitors around the socket
	for i = 1, 6 do
		addNode(t, { id = "cap" .. i, kind = "comp", parent = "mobo", cat = "misc", sub = "capacitor", solder = true, label = L("Kondansatör C" .. (40 + i), "Capacitor C" .. (40 + i)), index = i, needsOut = "mobo" })
	end

	-- case fans: front x3, rear, top x2
	local fanSlots = {
		{ "fan_f1", L("Ön Fan 1", "Front Fan 1") },
		{ "fan_f2", L("Ön Fan 2", "Front Fan 2") },
		{ "fan_f3", L("Ön Fan 3", "Front Fan 3") },
		{ "fan_r", L("Arka Fan", "Rear Fan") },
		{ "fan_t1", L("Üst Fan 1", "Top Fan 1") },
		{ "fan_t2", L("Üst Fan 2", "Top Fan 2") },
	}
	t.fanSlots = {}
	for i, f in fanSlots do
		local id = f[1]
		addNode(t, { id = id, kind = "comp", parent = "case", cat = "fan", label = f[2], blockers = { "side_panel" }, optional = true, dusty = true, index = i })
		addScrews(t, id, id .. "_s", 4, "PH2", L("Fan Vidası", "Fan Screw"))
		table.insert(t.fanSlots, id)
	end

	-- Cables
	local function cable(id, a, b, label, extra)
		local n = addNode(t, { id = id, kind = "cable", ends = { a, b }, label = label, blockers = { "side_panel" } })
		if extra then
			for k, v in extra do
				n[k] = v
			end
		end
		table.insert(t.nodes[a].cables, id)
		if b ~= a then
			table.insert(t.nodes[b].cables, id)
		end
		return n
	end
	cable("c24", "psu", "mobo", L("24-pin Anakart Güç", "24-pin ATX Power"))
	cable("ceps", "psu", "mobo", L("8-pin CPU Güç (EPS)", "8-pin CPU Power (EPS)"))
	for i = 1, 3 do
		cable("cpcie" .. i, "psu", "gpu", L("Ekran Kartı Güç " .. i, "GPU Power " .. i), { index = i })
	end
	cable("cfan_cpu", "cooler", "mobo", L("CPU Fan Kablosu", "CPU Fan Header"))
	for _, id in t.fanSlots do
		cable("cfan_" .. id, id, "mobo", L("Fan Kablosu", "Fan Cable"))
	end
	cable("csp_hdd1", "psu", "hdd1", L("SATA Güç (Disk)", "SATA Power (HDD)"))
	cable("csd_hdd1", "hdd1", "mobo", L("SATA Veri (Disk)", "SATA Data (HDD)"))
	cable("csp_ssd1", "psu", "ssd1", L("SATA Güç (SSD)", "SATA Power (SSD)"))
	cable("csd_ssd1", "ssd1", "mobo", L("SATA Veri (SSD)", "SATA Data (SSD)"))

	-- Things that must be in place for the PC to count as assembled
	t.required = { "psu", "mobo", "cpu", "cooler" }
	return t
end

----------------------------------------------------------------------------------------------------
-- Laptop
----------------------------------------------------------------------------------------------------
local function buildLaptop()
	local t = { kind = "laptop", nodes = {}, order = {} }

	addNode(t, { id = "base", kind = "root", label = L("Laptop Gövdesi", "Laptop Chassis") })
	addNode(t, { id = "lboard", kind = "board", parent = "base", label = L("Anakart (Lojik Kart)", "Logic Board"), side = "bottom", blockers = { "bottom_cover" } })

	addNode(t, { id = "feet", kind = "feet", parent = "base", label = L("Kauçuk Ayaklar", "Rubber Feet"), side = "bottom" })
	addNode(t, { id = "bottom_cover", kind = "panel", parent = "base", label = L("Alt Kapak", "Bottom Cover"), side = "bottom", pry = true })
	addScrews(t, "bottom_cover", "bc_s", 10, "model", L("Alt Kapak Vidası", "Bottom Cover Screw"), { side = "bottom" })
	-- two extra screws hidden under the feet on some models
	local hidden = {}
	for i = 1, 2 do
		local id = "bc_h" .. i
		addNode(t, { id = id, kind = "screw", owner = "bottom_cover", bit = "model", label = L("Gizli Vida (Ayak Altı)", "Hidden Screw (Under Foot)"), underFeet = true, side = "bottom", index = 10 + i })
		table.insert(hidden, id)
	end
	for _, id in hidden do
		table.insert(t.nodes.bottom_cover.screws, id)
	end

	local function comp(id, cat, label, extra)
		local n = addNode(t, { id = id, kind = "comp", parent = "base", cat = cat, label = label, side = "bottom", blockers = { "bottom_cover" } })
		if extra then
			for k, v in extra do
				n[k] = v
			end
		end
		return n
	end
	local function cable(id, a, b, label, extra)
		local n = addNode(t, { id = id, kind = "cable", ends = { a, b }, label = label, side = "bottom", blockers = { "bottom_cover" } })
		if extra then
			for k, v in extra do
				n[k] = v
			end
		end
		table.insert(t.nodes[a].cables, id)
		if b ~= a then
			table.insert(t.nodes[b].cables, id)
		end
		return n
	end

	comp("battery", "laptop", L("Batarya", "Battery"), { sub = "battery" })
	addScrews(t, "battery", "bat_s", 4, "PH1", L("Batarya Vidası", "Battery Screw"), { side = "bottom" })
	cable("bat_conn", "battery", "base", L("Batarya Konnektörü", "Battery Connector"))

	for i = 1, 2 do
		local id = "lram" .. i
		comp(id, "ram", L("RAM Yuvası " .. i, "RAM Slot " .. i), { form = "SODIMM", esd = true, optional = true, index = i, needsUnplugged = { "bat_conn" } })
		addNode(t, { id = id .. "_clip", kind = "latch", owner = id, parent = "base", label = L("RAM Mandalı " .. i, "RAM Clip " .. i), side = "bottom", blockers = { "bottom_cover" } })
		t.nodes[id].latches = { id .. "_clip" }
	end

	comp("lnvme", "storage", L("M.2 SSD", "M.2 SSD"), { kinds = { "nvme" }, esd = true, optional = true, needsUnplugged = { "bat_conn" } })
	addScrews(t, "lnvme", "lnv_s", 1, "PH0", L("M.2 Vidası", "M.2 Screw"), { side = "bottom" })

	comp("lsata", "storage", L("2.5\" Disk Yuvası", "2.5\" Drive Bay"), { kinds = { "hdd25", "ssd25" }, optional = true, needsUnplugged = { "bat_conn" } })
	addScrews(t, "lsata", "lsata_s", 2, "PH1", L("Disk Vidası", "Drive Screw"), { side = "bottom" })
	cable("lsata_conn", "lsata", "base", L("SATA Bağlantısı", "SATA Connector"))

	comp("lwifi", "misc", L("Wi-Fi Kartı", "Wi-Fi Card"), { sub = "wifi", esd = true, optional = true, needsUnplugged = { "bat_conn" } })
	addScrews(t, "lwifi", "lwifi_s", 1, "PH0", L("Wi-Fi Vidası", "Wi-Fi Screw"), { side = "bottom" })
	cable("lwifi_ant", "lwifi", "base", L("Anten Kabloları", "Antenna Cables"))

	comp("lfan", "laptop", L("Fan ve Soğutucu", "Fan & Heatsink"), { sub = "fan", dusty = true, needsUnplugged = { "bat_conn" } })
	addScrews(t, "lfan", "lfan_s", 5, "PH1", L("Soğutucu Vidası", "Heatsink Screw"), { side = "bottom" })
	cable("lfan_conn", "lfan", "base", L("Fan Kablosu", "Fan Cable"))

	comp("lcmos", "misc", L("BIOS Pili", "CMOS Battery"), { sub = "cmos", needsUnplugged = { "bat_conn" } })
	cable("lcmos_conn", "lcmos", "base", L("BIOS Pil Kablosu", "CMOS Cable"))

	comp("dcjack", "laptop", L("Şarj Soketi", "DC Jack"), { sub = "dcjack", needsUnplugged = { "bat_conn" } })
	addScrews(t, "dcjack", "dc_s", 1, "PH1", L("Soket Braketi Vidası", "Jack Bracket Screw"), { side = "bottom" })
	cable("dc_conn", "dcjack", "base", L("Şarj Soketi Kablosu", "DC Jack Cable"))

	-- keyboard: screws from the bottom (under the battery), then popped out from the top
	comp("keyboard", "laptop", L("Klavye", "Keyboard"), { sub = "keyboard", side = "top", blockers = { "battery" }, needsUnplugged = { "kb_ribbon" }, pry = true })
	addScrews(t, "keyboard", "kb_s", 6, "PH1", L("Klavye Vidası", "Keyboard Screw"), { side = "bottom", blockers = { "battery" } })
	cable("kb_ribbon", "keyboard", "base", L("Klavye Şerit Kablosu", "Keyboard Ribbon"), { blockers = { "bottom_cover", "battery" } })

	-- lid side
	addNode(t, { id = "bezel", kind = "panel", parent = "base", label = L("Ekran Çerçevesi", "Screen Bezel"), side = "top", pry = true, lidOpen = true })
	comp("screen", "laptop", L("Ekran Paneli", "Display Panel"), { sub = "screen", side = "top", lidOpen = true, blockers = { "bezel" }, needsUnplugged = { "bat_conn", "edp_conn" } })
	addScrews(t, "screen", "scr_s", 4, "PH1", L("Panel Vidası", "Panel Screw"), { side = "top", lidOpen = true, blockers = { "bezel" } })
	cable("edp_conn", "screen", "base", L("Ekran Kablosu (eDP)", "Display Cable (eDP)"), { side = "top", lidOpen = true, blockers = { "bezel" }, afterScrews = "screen" })
	comp("hinges", "laptop", L("Menteşeler", "Hinges"), { sub = "hinge", side = "top", lidOpen = true, blockers = { "bezel" }, needsUnplugged = { "bat_conn" } })
	addScrews(t, "hinges", "hng_s", 4, "PH1", L("Menteşe Vidası", "Hinge Screw"), { side = "top", lidOpen = true, blockers = { "bezel" } })

	t.required = { "battery", "lfan", "keyboard", "screen", "hinges", "dcjack", "lcmos" }
	return t
end

Templates.desktop = buildDesktop()
Templates.laptop = buildLaptop()

function Templates.get(kind: string)
	return Templates[kind]
end

return Templates
