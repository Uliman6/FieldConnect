# Learning Log

A running log of code changes with explanations and documentation references to help understand the codebase.

---

## How This Learning System Works

### 1. Change Summaries
Every significant code change gets documented with:
- What was fixed/added and why
- Before/after code comparisons
- Links to official documentation

### 2. LEARNING Comments in Code
Look for `// LEARNING:` comments in the codebase that explain tricky parts:
```javascript
// LEARNING: We use optional chaining (?.) here because user might be null
// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Optional_chaining
const userName = user?.name ?? 'Guest';
```

### 3. Debugging Sessions
When we debug issues, the process is documented step-by-step:
1. **Symptom**: What the user reported
2. **Investigation**: How we found the root cause
3. **Root Cause**: The actual bug
4. **Fix**: The solution and why it works

### 4. Pattern Recognition
Common patterns are called out when they appear:
- **Async/Await** - Handling asynchronous operations
- **Array Methods** - map, filter, reduce, find
- **Destructuring** - Extracting values from objects/arrays
- **Spread Operator** - Copying and merging objects

### 5. Mini Exercises
After learning a concept, try these to practice:
- Modify the code slightly and predict the outcome
- Find similar patterns elsewhere in the codebase
- Write a small test case

---

## 2026-04-07: Daily Log Hours & Event Type Parsing Fix

### Summary
Fixed two issues:
1. **Hours defaulting**: Hours weren't defaulting to 8 when a company was mentioned but workers count was 0 or missing
2. **Event type bias**: AI was over-assigning "Quality" type to general observations

### Files Changed
- `node-backend/src/services/transcript-parser.service.js`

---

### Concept 1: Truthy/Falsy Values in JavaScript

**The Bug:**
```javascript
// BEFORE - Only defaults hours when workers > 0
if (task.company_name && task.workers > 0 && (!task.hours || task.hours === 0)) {
  task.hours = 8;
}
```

**The Fix:**
```javascript
// AFTER - Defaults hours whenever company exists
if (task.company_name && (!task.hours || task.hours === 0)) {
  task.hours = 8;
}
```

**Why it matters:**
In JavaScript, `0` is a "falsy" value. When `task.workers` is `0` or `undefined`:
- `task.workers > 0` → `false` (condition fails, no default applied)
- By removing this check, we default hours for ANY company mention

**JavaScript Falsy Values:**
| Value | Type | Description |
|-------|------|-------------|
| `false` | Boolean | The keyword false |
| `0` | Number | Zero |
| `""` | String | Empty string |
| `null` | Object | Absence of value |
| `undefined` | Undefined | Variable not assigned |
| `NaN` | Number | Not a Number |

**Documentation:**
- MDN: [Falsy](https://developer.mozilla.org/en-US/docs/Glossary/Falsy)
- MDN: [Truthy](https://developer.mozilla.org/en-US/docs/Glossary/Truthy)

---

### Concept 2: Short-Circuit Evaluation with Logical AND (&&)

**The Code:**
```javascript
if (task.company_name && (!task.hours || task.hours === 0)) {
  task.hours = 8;
}
```

**How it works:**
JavaScript evaluates `&&` (AND) left-to-right and **stops early** if it finds a falsy value:

1. Check `task.company_name` → if falsy, STOP (whole expression is false)
2. If truthy, check `(!task.hours || task.hours === 0)`
3. Only if BOTH are truthy, execute the block

This is called **short-circuit evaluation** - JavaScript doesn't evaluate the right side if the left side already determines the result.

**Documentation:**
- MDN: [Logical AND (&&)](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Logical_AND)

---

### Concept 3: Template Literals with Conditional Expressions

**The Code:**
```javascript
console.log(`[transcript-parser] Defaulting hours to 8 for ${task.company_name}${task.workers > 0 ? ` (${task.workers} workers)` : ''}`);
```

**Breaking it down:**
1. **Template literal**: String enclosed in backticks (`) allows embedded expressions
2. **Expression interpolation**: `${expression}` embeds JavaScript inside strings
3. **Ternary operator**: `condition ? valueIfTrue : valueIfFalse`

**Step by step:**
```javascript
// If task.company_name = "ABC Electric" and task.workers = 5:
`Defaulting hours to 8 for ${task.company_name}${task.workers > 0 ? ` (${task.workers} workers)` : ''}`
// Evaluates to:
"Defaulting hours to 8 for ABC Electric (5 workers)"

// If task.company_name = "ABC Electric" and task.workers = 0:
// Evaluates to:
"Defaulting hours to 8 for ABC Electric"
```

**Documentation:**
- MDN: [Template Literals](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Template_literals)
- MDN: [Conditional (Ternary) Operator](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Conditional_operator)

---

### Concept 4: AI Prompt Engineering

**The Problem:**
The AI was categorizing general observations as "Quality" because the prompt didn't clearly define when to use "Other".

**The Fix:**
Added explicit guidance in the prompt:

```
GENERAL:
- Other: Use for general notes, observations, site conditions, or anything
  that doesn't clearly fit the categories above. This is the DEFAULT if no
  specific category applies.
```

**Key Prompt Engineering Principles:**
1. **Be explicit about defaults** - Tell the AI what to do when uncertain
2. **Use negative examples** - "NOT for general observations"
3. **Prioritize categories** - List the default category last with clear "catch-all" language
4. **Use emphasis** - Words like "ONLY" and "DEFAULT" guide AI behavior

**Documentation:**
- OpenAI: [Prompt Engineering Guide](https://platform.openai.com/docs/guides/prompt-engineering)
- Anthropic: [Prompt Engineering](https://docs.anthropic.com/en/docs/build-with-claude/prompt-engineering/overview)

---

### Mini Exercise: Practice These Concepts

**Exercise 1: Truthy/Falsy**
What does this code output? Try to predict before running:
```javascript
const values = [0, '', null, 'hello', 42, undefined, [], {}];
values.forEach(v => {
  console.log(`${JSON.stringify(v)} is ${v ? 'truthy' : 'falsy'}`);
});
```

**Exercise 2: Short-Circuit**
Rewrite this using short-circuit evaluation:
```javascript
let message;
if (user) {
  if (user.name) {
    message = user.name;
  } else {
    message = 'Anonymous';
  }
} else {
  message = 'Anonymous';
}
```
<details>
<summary>Solution</summary>

```javascript
const message = user?.name || 'Anonymous';
// Or even better with nullish coalescing:
const message = user?.name ?? 'Anonymous';
```
</details>

**Exercise 3: Find Similar Patterns**
Search the codebase for other uses of the ternary operator in template literals:
```bash
grep -r "\\`.*\\\${.*?.*:.*}.*\\`" --include="*.js" --include="*.ts"
```

---

## 2026-04-07: Voice Diary Feature (Formless Voice-First Experience)

### Summary
Built a new "formless" voice-first experience as a separate entry point. Users record voice notes throughout the day, and the system automatically categorizes and summarizes them.

### Files Created
- `Frontend/src/app/(voice-diary)/_layout.tsx` - 2-tab layout
- `Frontend/src/app/(voice-diary)/index.tsx` - Record tab
- `Frontend/src/app/(voice-diary)/dashboard.tsx` - Dashboard tab
- `Frontend/src/lib/voice-diary-store.ts` - Local state management
- `node-backend/src/services/voice-diary.service.js` - AI categorization
- `node-backend/src/controllers/voice-diary.controller.js` - API handlers
- `node-backend/src/routes/voice-diary.routes.js` - Route definitions

---

### Concept 1: Expo Router Route Groups

**The Pattern:**
```
app/
├── (tabs)/          ← Route group for main 6-tab app
│   └── _layout.tsx
├── (voice-diary)/   ← Route group for voice diary (separate entry)
│   └── _layout.tsx
└── _layout.tsx      ← Root layout registers both
```

**How it works:**
- Parentheses `()` create a "route group" - organizes files without affecting URL
- Each group can have its own `_layout.tsx` with different tab structure
- Navigate between groups: `router.push('/(voice-diary)')`

**Documentation:**
- Expo Router: [Route Groups](https://docs.expo.dev/router/layouts/#groups)

---

### Concept 2: Zustand State Management

**The Code:**
```typescript
// LEARNING: Zustand creates a store with state and actions in one place
// Much simpler than Redux - no reducers, actions files, etc.
export const useVoiceDiaryStore = create<VoiceDiaryStore>()(
  persist(
    (set, get) => ({
      // State
      voiceNotes: [],

      // Actions
      addVoiceNote: (audioUri, duration) => {
        const note = { id: generateId(), audioUri, duration, ... };
        set((state) => ({
          voiceNotes: [note, ...state.voiceNotes],
        }));
        return note;
      },

      // Selectors (using get())
      getVoiceNotesForDate: (date) => {
        return get().voiceNotes.filter(n => n.createdAt.startsWith(date));
      },
    }),
    {
      name: 'voice-diary-storage',  // localStorage key
      storage: createJSONStorage(() => AsyncStorage),
    }
  )
);
```

**Key Concepts:**
1. `set()` - Updates state (like setState but for store)
2. `get()` - Reads current state (for selectors/computed values)
3. `persist()` - Automatically saves to AsyncStorage

**Documentation:**
- Zustand: [Getting Started](https://zustand-demo.pmnd.rs/)
- Zustand: [Persist Middleware](https://docs.pmnd.rs/zustand/integrations/persisting-store-data)

---

### Concept 3: AI Prompt Engineering for Categorization

**The Pattern:**
```javascript
const systemPrompt = `You are a construction site voice note processor...

CATEGORIES (use exactly these names):
- Safety: Safety concerns, hazards, PPE, incidents...
- Logistics: Deliveries, equipment moves, site access...
...

RULES:
1. Extract distinct pieces of information
2. Assign each to the MOST relevant category
...

OUTPUT FORMAT (JSON array):
[{"category": "Category Name", "content": "Extracted info"}]`;
```

**Key Principles:**
1. **Define exact outputs** - List valid category names
2. **Provide examples** - Show what each category means
3. **Set rules** - Clear instructions on what to do
4. **Specify format** - JSON structure expected

**Documentation:**
- OpenAI: [Prompt Engineering](https://platform.openai.com/docs/guides/prompt-engineering)

---

### Concept 4: React useRef for Non-Rendering State

**The Code:**
```typescript
// LEARNING: useRef holds values that DON'T trigger re-renders when changed
const mediaRecorderRef = useRef<MediaRecorder | null>(null);
const chunksRef = useRef<Blob[]>([]);
const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
```

**When to use useRef vs useState:**
| useRef | useState |
|--------|----------|
| MediaRecorder instance | isRecording boolean |
| Interval/timeout IDs | recordingDuration number |
| Accumulated data (chunks) | UI-visible error messages |
| Animated values | List of items to display |

**Documentation:**
- React: [useRef](https://react.dev/reference/react/useRef)

---

### Mini Exercise: Voice Diary

**Exercise 1: Add a New Category**
Add "Weather" as a category. You'll need to update:
1. `Frontend/src/lib/voice-diary-store.ts` - Add to `VOICE_DIARY_CATEGORIES`
2. `node-backend/src/services/voice-diary.service.js` - Add to categories array + prompt
3. `Frontend/src/app/(voice-diary)/dashboard.tsx` - Add icon/color

**Exercise 2: Explore the Code**
Find where the AI categorization prompt is defined and add a new rule:
```bash
grep -n "CATEGORIES" node-backend/src/services/voice-diary.service.js
```

---

## Tips for Reading This Codebase

### Understanding the Flow
1. **Frontend** (`Frontend/`) → User records voice → Sends to backend
2. **Backend** (`node-backend/`) → Transcribes audio → AI parses transcript → Stores in database
3. **transcript-parser.service.js** → The AI parsing logic for both daily logs and events

### Key Patterns Used
- **Service Pattern**: Business logic in `services/` folder
- **Controller Pattern**: HTTP handling in `controllers/` folder
- **Prisma ORM**: Database queries using `prisma.model.findMany()`, etc.

---

## Additional Learning Resources

### JavaScript
- [MDN JavaScript Guide](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide) - Comprehensive reference
- [JavaScript.info](https://javascript.info/) - Modern tutorial with examples

### Node.js/Express
- [Express.js Guide](https://expressjs.com/en/guide/routing.html)
- [Node.js Docs](https://nodejs.org/docs/latest/api/)

### React Native/Expo
- [Expo Documentation](https://docs.expo.dev/)
- [React Native Docs](https://reactnative.dev/docs/getting-started)

### Database (Prisma)
- [Prisma Documentation](https://www.prisma.io/docs)

---

*This document is updated with each significant code change to help understand both the code and the underlying concepts.*
