-- Geometry checks shared by the specs.

local roblox = require("@lune/roblox")
local Vector3 = roblox.Vector3

local Geometry = {}

-- World-axis bounding box of a part (rotation included).
function Geometry.box(d)
	local abs = math.abs
	local cf, sz = d.CFrame, d.Size
	local r, u, l = cf.RightVector, cf.UpVector, cf.LookVector
	local e = Vector3.new(abs(r.X) * sz.X + abs(u.X) * sz.Y + abs(l.X) * sz.Z, abs(r.Y) * sz.X + abs(u.Y) * sz.Y + abs(l.Y) * sz.Z, abs(r.Z) * sz.X + abs(u.Z) * sz.Y + abs(l.Z) * sz.Z) / 2
	local p = cf.Position
	return p - e, p + e
end

-- The lanes of every road as rectangles { x0, z0, x1, z1, id }, a pace in from the kerbs (the kerbside
-- may have awnings, canopies and lamp arms over it).
function Geometry.carriageways(layout): { { any } }
	local function sidewalk(kind: string): number
		return if kind == "main" then 10 elseif kind == "ring" then 6 else 9
	end
	local rects = {}
	for _, r in layout.roads do
		local cw = r.width - sidewalk(r.kind) * 2
		local x0, x1 = math.min(r.a.X, r.b.X), math.max(r.a.X, r.b.X)
		local z0, z1 = math.min(r.a.Y, r.b.Y), math.max(r.a.Y, r.b.Y)
		if r.vertical then
			table.insert(rects, { x0 - cw / 2 + 1.5, z0, x1 + cw / 2 - 1.5, z1, r.id })
		else
			table.insert(rects, { x0, z0 - cw / 2 + 1.5, x1, z1 + cw / 2 - 1.5, r.id })
		end
	end
	return rects
end

-- Solid parts under `root` that stand up more than a kerb (roadY + 1.5) inside one of the rectangles:
-- things across a lane. Returns descriptions and how many solid parts were looked at.
function Geometry.solidsInRoad(root, rects, roadY: number): ({ string }, number)
	local hits, checked = {}, 0
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 1 and d.CanCollide then
			local lo, hi = Geometry.box(d)
			if hi.Y - roadY > 1.5 and (hi.X - lo.X) * (hi.Z - lo.Z) > 4 then
				checked += 1
				for _, rc in rects do
					if hi.X > rc[1] and lo.X < rc[3] and hi.Z > rc[2] and lo.Z < rc[4] then
						table.insert(hits, string.format("%s (%.0fx%.0fx%.0f) at (%.0f, %.0f) on road %s", d:GetFullName(), hi.X - lo.X, hi.Y - lo.Y, hi.Z - lo.Z, (lo.X + hi.X) / 2, (lo.Z + hi.Z) / 2, tostring(rc[5])))
						break
					end
				end
			end
		end
	end
	return hits, checked
end

-- Visible parts under `root` that neither rest on the ground (groundAt(x, z) gives its height)
-- nor touch another part: things hanging in the air. Returns them and how many parts were checked.
function Geometry.floating(root, groundAt: (number, number) -> number, eps: number?): ({ any }, number)
	eps = eps or 0.06
	local parts = {}
	for _, d in root:GetDescendants() do
		if d:IsA("BasePart") and d.Transparency < 0.95 then
			local lo, hi = Geometry.box(d)
			table.insert(parts, { d = d, lo = lo, hi = hi })
		end
	end
	local CELL = 16
	local floor = math.floor
	local grid = {}
	for i, p in parts do
		for x = floor(p.lo.X / CELL), floor(p.hi.X / CELL) do
			for y = floor(p.lo.Y / CELL), floor(p.hi.Y / CELL) do
				for z = floor(p.lo.Z / CELL), floor(p.hi.Z / CELL) do
					local k = x .. "," .. y .. "," .. z
					local c = grid[k]
					if not c then
						c = {}
						grid[k] = c
					end
					table.insert(c, i)
				end
			end
		end
	end
	local out = {}
	for i, a in parts do
		local ok = a.lo.Y <= groundAt((a.lo.X + a.hi.X) / 2, (a.lo.Z + a.hi.Z) / 2) + 0.3
		if not ok then
			-- (the cells around the part, eps included: a neighbour can sit just across a cell edge)
			for x = floor((a.lo.X - eps) / CELL), floor((a.hi.X + eps) / CELL) do
				for y = floor((a.lo.Y - eps) / CELL), floor((a.hi.Y + eps) / CELL) do
					for z = floor((a.lo.Z - eps) / CELL), floor((a.hi.Z + eps) / CELL) do
						for _, j in grid[x .. "," .. y .. "," .. z] or {} do
							local b = parts[j]
							if j ~= i and a.lo.X <= b.hi.X + eps and b.lo.X <= a.hi.X + eps and a.lo.Y <= b.hi.Y + eps and b.lo.Y <= a.hi.Y + eps and a.lo.Z <= b.hi.Z + eps and b.lo.Z <= a.hi.Z + eps then
								ok = true
								break
							end
						end
						if ok then
							break
						end
					end
					if ok then
						break
					end
				end
				if ok then
					break
				end
			end
		end
		if not ok then
			table.insert(out, a.d)
		end
	end
	return out, #parts
end

return Geometry
