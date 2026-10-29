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
			for x = floor(a.lo.X / CELL), floor(a.hi.X / CELL) do
				for y = floor(a.lo.Y / CELL), floor(a.hi.Y / CELL) do
					for z = floor(a.lo.Z / CELL), floor(a.hi.Z / CELL) do
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
