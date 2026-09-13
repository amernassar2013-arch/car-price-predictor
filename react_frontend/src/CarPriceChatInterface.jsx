import { useState, useRef, useEffect } from "react";

export default function CarPriceChatInterface() {
  const [messages, setMessages] = useState([
    {
      id: 1,
      role: "assistant",
      type: "text",
      content: "اهلاً! وصفلي السيارة يلي بدك تعرف سعرها المتوقع (الماركة، الموديل، السنة، الكيلومترات...)",
    },
  ]);
  const [inputValue, setInputValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function addMessage(msg) {
    setMessages((prev) => [...prev, { id: prev.length + 1, ...msg }]);
  }

  async function handleSend() {
    const text = inputValue.trim();
    if (!text || isLoading) return;

    addMessage({ role: "user", type: "text", content: text });
    setInputValue("");
    setIsLoading(true);

    try {
      const parseRes = await fetch("http://127.0.0.1:5000/api/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const extracted = await parseRes.json();

      if (extracted.error) {
        addMessage({ role: "assistant", type: "text", content: "ما قدرت افهم الوصف، جرب صياغة تانية." });
        setIsLoading(false);
        return;
      }

      addMessage({ role: "assistant", type: "extracted", content: extracted });

      const predictRes = await fetch("http://127.0.0.1:5000/api/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extracted),
      });
      const priceResult = await predictRes.json();

      addMessage({ role: "assistant", type: "price", content: priceResult });
    } catch (err) {
      addMessage({ role: "assistant", type: "text", content: "صار خطأ بالاتصال بالسيرفر، تأكد إنو الباك اند شغال." });
    }

    setIsLoading(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div dir="rtl" className="flex flex-col h-screen bg-neutral-900 text-neutral-100 font-sans">
      <header className="border-b border-neutral-800 px-6 py-3">
        <h1 className="text-base font-medium text-neutral-200">مستشار أسعار السيارات</h1>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
          {messages.map((msg) => (
            <MessageBubble key={msg.id} msg={msg} />
          ))}
          {isLoading && (
            <div className="text-sm text-neutral-500">عم أحلل الطلب...</div>
          )}
          <div ref={scrollRef} />
        </div>
      </div>

      <div className="px-4 pb-6 pt-2">
        <div className="max-w-2xl mx-auto flex items-center gap-2 border border-neutral-800 rounded-2xl px-3 py-1.5 shadow-sm bg-neutral-800 focus-within:border-neutral-600">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="اسأل عن سعر أي سيارة..."
            className="flex-1 bg-transparent outline-none text-sm py-1.5 text-neutral-100 placeholder-neutral-500"
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !inputValue.trim()}
            className="w-8 h-8 shrink-0 rounded-full bg-neutral-100 text-neutral-800 flex items-center justify-center disabled:opacity-30"
            aria-label="إرسال"
          >
            <ArrowIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ msg }) {
  if (msg.type === "text") {
    const isUser = msg.role === "user";
    return isUser ? (
      <div className="self-start max-w-[80%] bg-neutral-800 rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed">
        {msg.content}
      </div>
    ) : (
      <div className="self-end max-w-[85%] text-[15px] leading-relaxed text-neutral-100">
        {msg.content}
      </div>
    );
  }

  if (msg.type === "extracted") {
    const info = msg.content;
    const rows = [
      ["الماركة", info.make],
      ["الموديل", info.model],
      ["السنة", info.year],
      ["الكيلومترات", info.mileage ? info.mileage.toLocaleString() + " كم" : "-"],
      ["نوع الوقود", info.fuel_type],
      ["الحالة", info.condition],
    ];
    return (
      <div className="self-end max-w-[85%] w-full bg-neutral-800 border border-neutral-700 rounded-xl divide-y divide-neutral-700">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between px-4 py-2 text-sm">
            <span className="text-neutral-400">{label}</span>
            <span className="font-mono text-neutral-100">{value ?? "-"}</span>
          </div>
        ))}
      </div>
    );
  }

  if (msg.type === "price") {
    const { price, mae } = msg.content;
    return (
      <div className="self-end max-w-[85%] w-full bg-neutral-800 border border-neutral-700 rounded-xl px-5 py-4">
        <p className="text-sm text-neutral-400 mb-1">السعر المتوقع</p>
        <p className="text-3xl font-semibold font-mono text-neutral-50">
          {price.toLocaleString()} $
        </p>
        <p className="text-xs text-neutral-500 mt-2">
          هامش خطأ متوقع (MAE) تقريبًا ± {mae.toLocaleString()} $
        </p>
      </div>
    );
  }

  return null;
}

function ArrowIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}