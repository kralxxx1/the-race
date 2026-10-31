-- The people of the city: every one is rolled by PersonStyle and built from parts, so a crowd is full of
-- different faces and clothes; nobody wears the catalog's staring, pale bodies.

local Engine = require("../lib/Engine")
local Mock = require("../lib/Mock")
local task = require("@lune/task")

return function(T)
	Engine.context = "server"
	local game = Engine.load("build/PCTamirci.rbxlx")
	local PersonStyle = Engine.mod("ReplicatedStorage.Shared.Data.PersonStyle")
	local Npc = Engine.mod("ServerScriptService.Server.Services.NpcService")
	local Config = Engine.mod("ReplicatedStorage.Shared.Config")

	T.test("people: thousands of different looks come out of a few dozen roles", function()
		local looks = {}
		for name, look in Npc.Looks do
			looks[#looks + 1] = { name = name, look = look }
		end
		table.sort(looks, function(a, b)
			return a.name < b.name
		end)
		T.ok(#looks >= 30, "roles: " .. #looks)
		local rng = Mock.Random.new(77)
		local seen, n = {}, 0
		local hair, tops, bottoms, skins, shoes, extras = {}, {}, {}, {}, {}, {}
		for round = 1, 100 do
			for _, l in looks do
				local gender = if (round + #l.name) % 2 == 0 then "m" else "f"
				local st = PersonStyle.roll(l.look, gender, rng)
				seen[PersonStyle.key(st)] = true
				n += 1
				hair[st.hair.style] = true
				tops[st.top.kind] = true
				bottoms[st.bottom.kind] = true
				skins[table.concat(st.skin, ",")] = true
				shoes[table.concat(st.shoes, ",")] = true
				for _, e in st.extras do
					extras[e] = true
				end
				-- a person's own sanity
				T.ok(PersonStyle.HAIR_STYLES[gender][1] ~= nil and st.size ~= nil, "no hair or build")
				T.ok(st.top.color[1] >= 0 and st.top.color[1] <= 255, "colour out of range")
			end
		end
		local function count(t)
			local c = 0
			for _ in t do
				c += 1
			end
			return c
		end
		local unique = count(seen)
		T.ok(unique >= n * 0.98, "only " .. unique .. " different people among " .. n)
		T.ok(count(hair) >= 24, "hair styles: " .. count(hair))
		T.ok(count(tops) >= 10, "kinds of top: " .. count(tops))
		T.ok(count(bottoms) >= 7, "kinds of bottom: " .. count(bottoms))
		T.ok(count(skins) >= 12, "skin tones: " .. count(skins))
		T.ok(count(shoes) >= 7, "shoe colours: " .. count(shoes))
		T.ok(count(extras) >= 40, "accessories in all: " .. count(extras))
		-- every hair style has parts to build
		for style in hair do
			T.ok(Npc.HairStyles[style] ~= nil, "no hair parts for " .. style)
		end
	end)

	T.test("people: a crowd is built from parts, with hair, clothes and a face to look at", function()
		Npc.init()
		T.eq(Config.RealisticNpcs, false, "the catalog's pale bodies are off")
		local rng = Mock.Random.new(5)
		local names = {}
		for name in Npc.Looks do
			table.insert(names, name)
		end
		table.sort(names)
		local colours = {}
		for i = 1, 90 do
			local look = names[(i - 1) % #names + 1]
			local person = Npc.plain(look, if i % 2 == 0 then "m" else "f", rng)
			T.ok(person:GetAttribute("Plain") == true, "not a parts-made person")
			local head = person:FindFirstChild("Head")
			local torso = person:FindFirstChild("UpperTorso")
			T.ok(head ~= nil and torso ~= nil and person:FindFirstChild("HumanoidRootPart") ~= nil, "no body")
			local parts = 0
			for _, d in person:GetDescendants() do
				if d:IsA("BasePart") then
					parts += 1
					T.ok(d.Size.Magnitude < 8, look .. ": a part of " .. d.Name .. " is huge")
				end
			end
			T.ok(parts >= 18 and parts <= 90, look .. ": " .. parts .. " parts")
			-- the skin is a real skin tone, never the mannequin grey
			local c = head.Color
			T.ok(not (math.abs(c.R - c.G) < 0.015 and math.abs(c.G - c.B) < 0.015 and c.R > 0.55 and c.R < 0.7), look .. ": a grey head")
			colours[string.format("%.2f.%.2f.%.2f", torso.Color.R, torso.Color.G, torso.Color.B)] = true
			person:Destroy()
		end
		local n = 0
		for _ in colours do
			n += 1
		end
		T.ok(n >= 60, "the 90 people wear only " .. n .. " different tops")
	end)

	T.test("people: the street crowd for the clients is a pool of different people", function()
		local pool = game:GetService("ReplicatedStorage"):FindFirstChild("Avatars")
		T.ok(pool ~= nil, "no street pool")
		-- (built in the background a few at a time)
		local waited = 0
		while #pool:GetChildren() < Config.StreetPeople and waited < 400 do
			task.wait(0.05)
			waited += 1
		end
		T.ok(#pool:GetChildren() >= 100, "street people ready: " .. #pool:GetChildren())
		local keys = {}
		for _, m in pool:GetChildren() do
			local torso = m:FindFirstChild("UpperTorso")
			local head = m:FindFirstChild("Head")
			T.ok(torso ~= nil and head ~= nil and m:GetAttribute("Plain") == true, "a street person without a body")
			keys[string.format("%.2f.%.2f|%.2f.%.2f.%.2f", torso.Color.R, torso.Color.G, head.Color.R, head.Color.G, head.Color.B)] = true
		end
		local n = 0
		for _ in keys do
			n += 1
		end
		T.ok(n >= 80, "only " .. n .. " different people in the street pool")
	end)
end
