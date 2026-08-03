"""
Builds the user manual PDF.

Kept as a script rather than a checked-in binary so the manual can be
regenerated whenever behaviour changes — the content lives here, next to
the code it describes.

    python scripts/build-manual.py
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate,
    Frame,
    KeepTogether,
    PageBreak,
    PageTemplate,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

OUT = "SEO Dashboard — User Manual.pdf"

INK = colors.HexColor("#1F2430")
BODY = colors.HexColor("#3C4250")
MUTED = colors.HexColor("#6B7280")
FAINT = colors.HexColor("#9AA0AC")
ACCENT = colors.HexColor("#5B4BD6")
MINT_BG = colors.HexColor("#EAF7F1")
MINT_TX = colors.HexColor("#1C6B4F")
RULE = colors.HexColor("#E3E4EA")
PANEL = colors.HexColor("#F7F7FA")

ss = getSampleStyleSheet()


def style(name, **kw):
    base = dict(fontName="Helvetica", fontSize=9.6, leading=14.4, textColor=BODY,
                alignment=TA_LEFT, spaceAfter=0)
    base.update(kw)
    return ParagraphStyle(name, **base)


S = {
    "title": style("title", fontName="Helvetica-Bold", fontSize=27, leading=31,
                   textColor=INK, spaceAfter=6),
    "subtitle": style("subtitle", fontSize=12.5, leading=18, textColor=MUTED,
                      spaceAfter=20),
    "h1": style("h1", fontName="Helvetica-Bold", fontSize=17, leading=22,
                textColor=INK, spaceBefore=2, spaceAfter=8),
    "h2": style("h2", fontName="Helvetica-Bold", fontSize=11.8, leading=16,
                textColor=INK, spaceBefore=13, spaceAfter=5),
    "h3": style("h3", fontName="Helvetica-Bold", fontSize=9.8, leading=14,
                textColor=ACCENT, spaceBefore=10, spaceAfter=3),
    "body": style("body", spaceAfter=7),
    "bullet": style("bullet", leftIndent=11, bulletIndent=1, spaceAfter=3.5),
    "small": style("small", fontSize=8.6, leading=12.6, textColor=MUTED,
                   spaceAfter=6),
    "auto": style("auto", fontSize=9, leading=13.4, textColor=MINT_TX),
    "cell": style("cell", fontSize=8.7, leading=12.2),
    "cellb": style("cellb", fontName="Helvetica-Bold", fontSize=8.7, leading=12.2,
                   textColor=INK),
    "cellh": style("cellh", fontName="Helvetica-Bold", fontSize=8, leading=11,
                   textColor=MUTED),
    "mono": style("mono", fontName="Courier", fontSize=8.4, leading=12.4,
                  textColor=INK),
}

story = []


def h1(t):
    story.append(Paragraph(t, S["h1"]))
    story.append(rule())


def h2(t):
    story.append(Paragraph(t, S["h2"]))


def h3(t):
    story.append(Paragraph(t, S["h3"]))


def p(t):
    story.append(Paragraph(t, S["body"]))


def small(t):
    story.append(Paragraph(t, S["small"]))


def bullets(items):
    for it in items:
        story.append(Paragraph(it, S["bullet"], bulletText="•"))
    story.append(Spacer(1, 5))


def rule(space=7):
    t = Table([[""]], colWidths=[165 * mm], rowHeights=[0.6])
    t.setStyle(TableStyle([("BACKGROUND", (0, 0), (-1, -1), RULE),
                           ("TOPPADDING", (0, 0), (-1, -1), 0),
                           ("BOTTOMPADDING", (0, 0), (-1, -1), 0)]))
    return KeepTogether([t, Spacer(1, space)])


def automatic(text):
    """The green 'you don't do this' callout — the manual's whole point."""
    inner = Paragraph(f"<b>Automatic&nbsp;&nbsp;</b>{text}", S["auto"])
    t = Table([[inner]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), MINT_BG),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LINEBEFORE", (0, 0), (0, -1), 2.2, colors.HexColor("#3FA97C")),
    ]))
    story.append(t)
    story.append(Spacer(1, 8))


def table(headers, rows, widths):
    data = [[Paragraph(h, S["cellh"]) for h in headers]]
    for r in rows:
        data.append([Paragraph(str(c), S["cellb"] if i == 0 else S["cell"])
                     for i, c in enumerate(r)])
    t = Table(data, colWidths=widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), PANEL),
        ("LINEBELOW", (0, 0), (-1, 0), 0.7, RULE),
        ("LINEBELOW", (0, 1), (-1, -2), 0.4, RULE),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), 7),
        ("RIGHTPADDING", (0, 0), (-1, -1), 7),
        ("TOPPADDING", (0, 0), (-1, -1), 5.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5.5),
    ]))
    story.append(t)
    story.append(Spacer(1, 9))


def code(lines):
    body = "<br/>".join(lines)
    t = Table([[Paragraph(body, S["mono"])]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PANEL),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.append(t)
    story.append(Spacer(1, 9))


# ══════════════════════════════════════════════════════════════════
# Cover
# ══════════════════════════════════════════════════════════════════

story.append(Spacer(1, 34))
story.append(Paragraph("SEO Dashboard", S["title"]))
story.append(Paragraph(
    "The complete guide to how the system works, what it does for you "
    "automatically, and what still needs a person.", S["subtitle"]))
story.append(rule(14))

p("This app replaces the <i>Mindcob New SEO Dashboard</i> spreadsheet. Everything "
  "the workbook did, it still does — verified cell by cell, 16,855 checks against "
  "the original file, with no mismatches. What it adds is a second audience: your "
  "client can sign in and see their own progress, in plain language, without you "
  "sending anything.")

p("There are two sides to it, and they never mix:")

table(
    ["Side", "Who", "What they can do"],
    [["Agency console<br/><font color='#6B7280'>/app</font>",
      "Admins, managers,<br/>specialists",
      "Add and manage everything: keywords, pages, backlinks, monthly rankings, "
      "Search Console figures, deliverables, team performance."],
     ["Client portal<br/><font color='#6B7280'>/portal</font>",
      "One login per client",
      "Read-only view of <i>their</i> project only, written for a non-specialist, "
      "plus a message thread to your team. Never sees another client, never sees "
      "backlink logins, never sees your internal notes."]],
    [34 * mm, 34 * mm, 97 * mm])

h2("How to read this manual")
p("Every section below answers the same three questions, because those are the "
  "ones that actually come up:")
bullets([
    "<b>What it is</b> — what the screen is for.",
    "<b>What you do</b> — the part that needs a person.",
    "<b>What happens by itself</b> — shown in a green box. If it is in a green "
    "box, do not type it, do not maintain it, and do not worry about keeping it "
    "in sync.",
])
small("The same explanations are built into the app: hover the small <b>?</b> "
      "next to any heading and you get the short version on screen.")

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# 1. Getting in
# ══════════════════════════════════════════════════════════════════

h1("1 &nbsp;·&nbsp; Accounts and signing in")

h2("The four roles")
table(
    ["Role", "Can do"],
    [["Admin", "Everything, including creating accounts, changing roles, resetting "
               "passwords and deleting projects. Only admins reach People &amp; access."],
     ["SEO Manager", "Full data access across every project. Cannot manage accounts."],
     ["SEO Specialist", "Reads and writes data on projects they are assigned to."],
     ["Client", "Read-only portal for their own project, plus messaging. No write "
                "access of any kind except sending a message."]],
    [34 * mm, 131 * mm])

h2("Your first sign-in")
p("The setup script prints an admin email and password. That password is a "
  "<i>setup default</i>, not a credential — the account is flagged so the first "
  "sign-in goes straight to a <b>Choose a password</b> screen, and the console "
  "stays shut until a real one is set. The same applies to every account an "
  "admin creates.")

automatic("The block is enforced before the page is even built, so there is no "
          "moment where data is on screen behind the password prompt.")

h2("Giving a client access")
p("You never handle a client's password. From <b>People &amp; access</b>, or a "
  "project's <b>Settings → Who can access this project</b>, press <b>Send "
  "invite</b>. That produces a one-time link you can send however you like — "
  "email, WhatsApp, anything.")
p("The client opens it, sees who invited them and which site it is for, chooses "
  "their own password, and lands on their dashboard already signed in.")

automatic("The link expires after 7 days, works exactly once, and is stored only "
          "as a one-way hash — so it cannot be recovered from the database or "
          "reused if forwarded. Issuing a new link cancels the old one. Lapsed "
          "invites are swept away nightly.")

small("If you re-open the invite dialog for someone, it generates a <i>fresh</i> "
      "link rather than showing the old one.")

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# 2. The data sections
# ══════════════════════════════════════════════════════════════════

h1("2 &nbsp;·&nbsp; The data, section by section")

# ── Keywords
h2("Keywords")
p("<b>What it is</b> &nbsp; Every search term the project is trying to rank for, "
  "and the page each one is meant to win.")
p("<b>What you do</b> &nbsp; Add keywords, set the intent and search volume, and "
  "map each one to a target page. Optionally set a backlink target.")

automatic("The target URL and focus keyword are inherited from the page you map "
          "to, so they can never drift apart — change the page, and every keyword "
          "on it follows. Link counts and progress are counted from your backlinks, "
          "never typed.")

h3("How the link count works")
p("A backlink counts towards a keyword when its anchor text matches. Matching "
  "ignores capitals and extra spaces, exactly as the spreadsheet's COUNTIFS did — "
  "so “SEO Services in Canada” counts towards “seo services in "
  "canada”. One deliberate difference from the sheet: a link carrying the "
  "same keyword in <i>both</i> anchor slots counts once, not twice.")

small("Deleting a keyword deletes its entire rank history with it. Unmapping a "
      "page leaves the keyword alone — it just stops inheriting that URL.")

# ── Backlinks
h2("Backlinks")
p("<b>What it is</b> &nbsp; Every link built to the site, who built it, and "
  "whether Google has indexed it.")
p("<b>What you do</b> &nbsp; Add each link with its URL, type, anchor text and "
  "published date. Mark it indexed once you have checked. Optionally record the "
  "login used to place it.")

automatic("The month a link belongs to comes from its published date — you never "
          "pick a month. New links are credited to whoever adds them. Every "
          "indexed change is written to the activity log with the person and time.")

h3("Login details are staff-only, always")
p("Credentials recorded against a link never reach the client portal and are "
  "never in a client CSV export. This is not a UI rule that could be bypassed: "
  "the query that serves the portal cannot return those columns at all. There is "
  "an automated test that plants a credential, loads the staff page so the cache "
  "holds it, then asserts the portal still cannot see it.")

# ── On-page
h2("On-page SEO")
p("<b>What it is</b> &nbsp; Every page being optimised, with its audit checklist "
  "and score.")
p("<b>What you do</b> &nbsp; Add pages, work through the checklist, record the "
  "SEO score and word count.")

automatic("The keyword count per page is derived from the keywords mapped to it. "
          "The traffic-light dot is calculated: green when the score is 80+, the "
          "page is indexed and on-page work is done; amber part-way; red "
          "otherwise. This is the workbook's own row colouring, recomputed on "
          "every read.")

small("Deleting a page unmaps any keyword pointing at it. The keywords survive — "
      "they just lose their target URL.")

story.append(PageBreak())

# ── Rankings
h2("Rankings")
p("<b>What it is</b> &nbsp; Where each keyword sits in Google, month by month.")
p("<b>What you do</b> &nbsp; Open <b>Enter positions</b>, pick the month, and "
  "type the absolute Google position for each keyword. Leave a box blank to "
  "record “not ranking”. Save the whole month in one go.")

automatic("The SERP page is worked out from the position — 14 is page 2 — and "
          "updates as you type. The check date is limited to inside the month you "
          "are entering, so a row can never be filed under one month and stamped "
          "with another. Positions typed into rows you have filtered out are still "
          "saved.")

h3("If you skip a month")
p("A gap is invisible in the charts, which simply join the two months either side "
  "and look continuous. So the system watches for it: the Rankings page shows a "
  "banner naming any month with no positions recorded, with a button that opens "
  "that month's grid directly. You can go back to <i>any</i> past month, whether "
  "or not it already has data.")

# ── Search Console
h2("Search data")
p("<b>What it is</b> &nbsp; Monthly clicks, impressions and organic sessions, as "
  "Google reports them.")
p("<b>What you do</b> &nbsp; Once a month, pull the figures from Search Console "
  "and Analytics and enter them.")

automatic("Click-through rate and month-on-month growth are calculated, never "
          "typed. The month, capture date and country are pre-filled with the "
          "next month you are missing, today's date, and the project's country. "
          "Deleting a month recalculates the following month's growth.")

small("The first month of a campaign shows no percentage change rather than an "
      "invented one — growth from nothing has no percentage.")

# ── Team
h2("Team performance")
p("<b>What it is</b> &nbsp; What each specialist has produced, and how much of it "
  "stuck.")

automatic("Nothing here is entered by hand. Every figure is counted from the "
          "“Built by” field on the backlinks themselves, so reassigning "
          "or deleting a link moves the numbers immediately.")

# ── Deliverables
h2("Deliverables")
p("<b>What it is</b> &nbsp; The work board. Anything marked client-visible also "
  "appears in the client's portal.")

automatic("The completion date is stamped only when the status actually changes — "
          "so editing a finished task later does not drag it into the wrong "
          "month's client report.")

# ── Messaging
h2("Messages")
p("<b>What it is</b> &nbsp; Conversations with the client, plus internal threads "
  "only the agency can see.")

automatic("The unread badge updates by itself every few seconds wherever you are "
          "in the app, and a new message raises a notification — you do not have "
          "to be on the Messages page to find out. Internal threads are invisible "
          "to the client even by direct link, and are not counted in their badge.")

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# 3. What the client sees
# ══════════════════════════════════════════════════════════════════

h1("3 &nbsp;·&nbsp; What the client sees")

p("The portal is deliberately not a copy of your console. It answers the "
  "questions a client actually asks, in their language:")

bullets([
    "<b>Overview</b> — a plain-English verdict on the month, the four headline "
    "numbers, and where their keywords sit on Google.",
    "<b>Keywords, Backlinks, On-page, Rankings, Search data</b> — the same "
    "records you manage, read-only, with the internal columns removed.",
    "<b>Progress</b> — the deliverables you marked client-visible.",
    "<b>Monthly report</b> — a printable summary. Their browser's print dialog "
    "saves it as a PDF.",
    "<b>Messages</b> — a direct line to your team.",
])

automatic("Reports open on the newest month that actually holds data, not the "
          "calendar month — so a client never opens an empty report on the 1st. "
          "Nothing is generated or scheduled; the report is assembled the moment "
          "they ask for it.")

h2("What the client can never see")
bullets([
    "Any other client's project.",
    "Backlink logins and passwords — not on screen, not in an export.",
    "Internal threads, or their unread count.",
    "Deliverables not marked client-visible.",
    "Any write action at all, except sending a message.",
])

# ══════════════════════════════════════════════════════════════════
# 4. Automation summary
# ══════════════════════════════════════════════════════════════════

h1("4 &nbsp;·&nbsp; Everything that happens without you")

p("One table, so you know exactly where the line is between your job and the "
  "system's.")

table(
    ["What", "When it happens"],
    [["SERP page from position", "As you type. Position 14 becomes page 2."],
     ["Keyword link counts", "Counted from anchor text on every read."],
     ["Keyword progress", "Indexed links against the target you set."],
     ["Backlink month", "Taken from the published date."],
     ["Backlink owner", "Set to you when you add a link."],
     ["Page keyword count", "Counted from the keywords mapped to the page."],
     ["Page health dot", "Score, indexed state and on-page status combined."],
     ["Click-through rate", "Clicks over impressions, on every read."],
     ["Month-on-month growth", "Compared with the previous month automatically."],
     ["Team performance", "Counted from the backlinks themselves."],
     ["Task completion date", "Stamped when the status changes, not on every edit."],
     ["Reporting month", "Newest month holding data, not the calendar month."],
     ["Skipped-month alert", "Checked whenever you open Rankings."],
     ["Unread badge + alert", "Polled every few seconds, app-wide."],
     ["Form defaults", "Analytics month, capture date, country, link owner."],
     ["Expired invite sweep", "Nightly."],
     ["Activity log pruning", "Monthly. Deletions and imports kept longer."],
     ["Cache refresh", "The moment anyone saves. Never stale, never manual."]],
    [52 * mm, 113 * mm])

h2("What still needs a person")
p("Being straight about the other side of the line:")
bullets([
    "<b>Ranking positions.</b> Typed in, or imported from a rank-tracker export. "
    "Fetching them from Google automatically needs a paid SERP API — the wiring "
    "is a small job once you choose a provider.",
    "<b>Search Console figures.</b> Pulled from Google monthly and entered.",
    "<b>Everything judgement-based</b> — which keywords to target, which pages to "
    "build, whether a link is worth having.",
    "<b>Sending the invite link.</b> The system makes it; you send it. There is "
    "no email service connected.",
])

story.append(PageBreak())

# ══════════════════════════════════════════════════════════════════
# 5. Monthly rhythm
# ══════════════════════════════════════════════════════════════════

h1("5 &nbsp;·&nbsp; The monthly rhythm")

p("A normal month, in order:")

table(
    ["When", "Do this"],
    [["Through the month",
      "Add backlinks as you build them. Tick <b>indexed</b> once Google has picked "
      "them up. Move deliverables across the board."],
     ["Start of the month",
      "Open <b>Rankings → Enter positions</b>, pick last month, and record where "
      "everything landed. Check the banner for any month you skipped."],
     ["Start of the month",
      "Pull Search Console and Analytics figures and add the month under "
      "<b>Search data</b>."],
     ["Before you report",
      "Open the client's <b>Monthly report</b>, check it reads well, and tell "
      "them it is ready. They can print it to PDF themselves."],
     ["Any time",
      "Reply to client messages. The badge tells you when there is something "
      "waiting, from anywhere in the app."]],
    [36 * mm, 129 * mm])

automatic("Nothing else needs doing. Totals, rates, charts, the client's whole "
          "report and every derived figure follow from the four things above.")

h2("When the client sends an updated spreadsheet")
p("Rather than re-importing and risking overwriting work done in the app, run the "
  "sync — it only ever <i>adds</i> what is missing:")
code(["npm run db:sync                # shows what it would add, changes nothing",
      "npm run db:sync -- --apply     # actually add them"])

# ══════════════════════════════════════════════════════════════════
# 6. Checking it is healthy
# ══════════════════════════════════════════════════════════════════

h1("6 &nbsp;·&nbsp; Checking the system is healthy")

p("Each of these can be pointed at the live site by adding the URL. They create "
  "and delete their own throwaway accounts.")

table(
    ["Command", "What it proves"],
    [["npm run doctor", "Config, database connection, schema, row counts."],
     ["npm run db:parity", "The database still matches the workbook, cell by cell."],
     ["npm run verify:invite", "The whole client invite flow, start to finish."],
     ["npm run verify:gate", "A default password really does block the console."],
     ["npm run verify:cache", "Edits appear at once, and client data stays separate."],
     ["npm run verify:chat", "Messaging, notifications, internal-thread privacy."]],
    [52 * mm, 113 * mm])

small("Example: <font face='Courier'>npm run verify:chat -- https://your-domain.com</font>")

h2("If something looks wrong")
table(
    ["Symptom", "Most likely cause"],
    [["A number looks stale",
      "It should not be — every save clears the cache. Reload once; if it "
      "persists, run <font face='Courier'>db:parity</font>."],
     ["A month is missing from a chart",
      "No positions were recorded for it. The Rankings banner will say so and "
      "link you straight there."],
     ["A client says they cannot sign in",
      "Their invite may have lapsed (7 days). Send a new one — it cancels the old."],
     ["A client sees nothing at all",
      "Their account may have been removed from the project. Re-add them under "
      "project Settings."],
     ["Everything is slow",
      "The database sleeps when idle on the free plan. The first request after a "
      "quiet spell pays a cold start."]],
    [44 * mm, 121 * mm])

story.append(Spacer(1, 8))
story.append(rule(6))
small("Deployment, environment variables and hosting are covered separately in "
      "<b>DEPLOYMENT.md</b> in the project folder.")


# ══════════════════════════════════════════════════════════════════
# Build
# ══════════════════════════════════════════════════════════════════

def decorate(canvas, doc):
    canvas.saveState()
    if doc.page > 1:
        canvas.setFont("Helvetica", 7.6)
        canvas.setFillColor(FAINT)
        canvas.drawString(22 * mm, 12 * mm, "SEO Dashboard · User Manual")
        canvas.drawRightString(188 * mm, 12 * mm, str(doc.page))
        canvas.setStrokeColor(RULE)
        canvas.setLineWidth(0.5)
        canvas.line(22 * mm, 16 * mm, 188 * mm, 16 * mm)
    canvas.restoreState()


doc = BaseDocTemplate(OUT, pagesize=A4,
                      leftMargin=22 * mm, rightMargin=22 * mm,
                      topMargin=20 * mm, bottomMargin=20 * mm,
                      title="SEO Dashboard — User Manual",
                      author="SEO Dashboard")
frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="body")
doc.addPageTemplates([PageTemplate(id="all", frames=[frame], onPage=decorate)])
doc.build(story)
print(f"wrote {OUT}")
