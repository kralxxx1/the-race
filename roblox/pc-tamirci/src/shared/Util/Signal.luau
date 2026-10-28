-- Signal: a tiny event object for module-to-module communication.
-- Handlers run in their own thread so one failing listener cannot break the others.

local Signal = {}
Signal.__index = Signal

export type Connection = { Connected: boolean, Disconnect: (Connection) -> () }

function Signal.new()
	return setmetatable({ _handlers = {} :: { any } }, Signal)
end

function Signal:Connect(fn: (...any) -> ())
	local conn = { Connected = true, _fn = fn }
	local handlers = self._handlers
	function conn.Disconnect(c)
		if not c.Connected then
			return
		end
		c.Connected = false
		local i = table.find(handlers, c)
		if i then
			table.remove(handlers, i)
		end
	end
	table.insert(handlers, conn)
	return conn
end

function Signal:Once(fn: (...any) -> ())
	local conn
	conn = self:Connect(function(...)
		conn:Disconnect()
		fn(...)
	end)
	return conn
end

function Signal:Fire(...)
	-- copy so handlers may disconnect while iterating
	local list = table.clone(self._handlers)
	for _, c in list do
		if c.Connected then
			task.spawn(c._fn, ...)
		end
	end
end

function Signal:Wait()
	local thread = coroutine.running()
	self:Once(function(...)
		task.spawn(thread, ...)
	end)
	return coroutine.yield()
end

function Signal:DisconnectAll()
	for _, c in table.clone(self._handlers) do
		c:Disconnect()
	end
end

return Signal
