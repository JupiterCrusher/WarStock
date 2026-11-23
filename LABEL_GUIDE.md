# Label guide · version 1

Label what the headline and snippet report. Use only that text; extra facts from
the linked article are not part of the model's input. The labels do not verify
events or forecast future war.

| Label | Use it for | Example (made up) |
| --- | --- | --- |
| `background` | Arms business, talks, history, or no new threat, buildup, or fighting | Defense firm wins radar contract |
| `threats_buildup` | An explicit threat, troop buildup, or exercise, without reported fighting | Government threatens strikes after troop buildup |
| `reported_fighting` | A reported actual attack, strike, clash, or shelling | Airstrike hits military base |

Use the main new claim. A ceasefire agreement that mentions old fighting is
background. A new attack that mentions failed talks is reported fighting.
A threat to attack is not a completed attack. An attributed report (“officials
say an attack hit a base”) can count as reported fighting; the label describes
the report, not its truth.

Skip for review when the supplied text is too vague, gives competing main
claims, recaps an old event without a clear new claim, or denies/disputes an
attack without enough context to choose. Keep a note when it helps. A skipped
item stays saved and does not become a training example.

Use the label page's three buttons or keys 1, 2, 3. S skips for review; U undoes
the last choice. Notes are optional. The page saves each choice before showing
the next item. Reopening it keeps prior labels. Near copies share a queue slot
to reduce repeat work.

Start with 100 labels. Before we label a larger batch, inspect counts and hard
cases together. A fixed model needs at least two collection dates and a tuned
model needs at least three. Each class needs 20 examples in training and five
each in test and any validation split, after removing copies that cross date
boundaries.
