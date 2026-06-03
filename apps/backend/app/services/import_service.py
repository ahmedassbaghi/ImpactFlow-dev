"""JSON bulk import: validate, preview, commit."""
from __future__ import annotations

import hashlib
import json
import secrets
import string
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.constants.grade_levels import is_valid_grade_key, label_for_key
from app.models import (
    AcademicYear,
    ImportLog,
    Organization,
    Participant,
    ParticipantGradeHistory,
    Program,
    ProgramEnrollment,
    School,
    TeachingAssignment,
    User,
    UserParticipantAssignment,
)
from app.utils.auth import get_password_hash

IMPORT_FORMAT_EXAMPLE: dict[str, Any] = {
    "academic_years": [{"title": "2025/2026", "start_date": "2025-09-01", "end_date": "2026-06-30"}],
    "programs": [{"name": "Reforç escolar", "description": "Sessions de suport", "program_type": "education"}],
    "schools": [{"name": "Escola Sant Francesc", "abbreviation": "ESF"}],
    "teachers": [{"email": "anna.serra@example.com", "full_name": "Anna Serra", "role": "professional"}],
    "students": [
        {
            "code": "ESF-2025-001",
            "first_name": "Youssef",
            "school_abbreviation": "ESF",
            "grade_key": "1E",
            "birth_year": 2012,
            "gender": "M",
            "nationality": "Marroc",
            "academic_year": "2025/2026",
            "program": "Reforç escolar",
        }
    ],
    "relationships": [
        {
            "teacher_email": "anna.serra@example.com",
            "student_code": "ESF-2025-001",
            "program": "Reforç escolar",
            "academic_year": "2025/2026",
        }
    ],
}

KNOWN_KEYS = {
    "academic_years": {"title", "start_date", "end_date"},
    "programs": {"name", "description", "program_type"},
    "schools": {"name", "abbreviation"},
    "teachers": {"email", "full_name", "role"},
    "students": {
        "code", "first_name", "school_abbreviation", "grade_key", "birth_year",
        "gender", "nationality", "academic_year", "program",
    },
    "relationships": {"teacher_email", "student_code", "program", "academic_year"},
}


def _err(section: str, field: str, message: str, index: int | None = None) -> dict:
    return {"section": section, "field": field, "message": message, "index": index}


def _temp_password(length: int = 12) -> str:
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def validate_structure(data: dict) -> list[dict]:
    errors: list[dict] = []
    if not isinstance(data, dict):
        return [_err("root", "json", "El JSON ha de ser un objecte")]

    for section, items in data.items():
        if section not in KNOWN_KEYS:
            errors.append(_err(section, section, f"Secció desconeguda: {section}"))
            continue
        if not isinstance(items, list):
            errors.append(_err(section, section, "Ha de ser una llista"))
            continue
        for i, item in enumerate(items):
            if not isinstance(item, dict):
                errors.append(_err(section, section, "Element ha de ser un objecte", i))
                continue
            unknown = set(item.keys()) - KNOWN_KEYS[section]
            for uk in unknown:
                errors.append(_err(section, uk, f"Camp desconegut: {uk}", i))

    teachers = data.get("teachers") or []
    emails = [t.get("email", "").lower() for t in teachers if isinstance(t, dict)]
    if len(emails) != len(set(e for e in emails if e)):
        errors.append(_err("teachers", "email", "Emails duplicats dins del JSON"))

    students = data.get("students") or []
    codes = [s.get("code") for s in students if isinstance(s, dict)]
    if len(codes) != len(set(c for c in codes if c)):
        errors.append(_err("students", "code", "Codis duplicats dins del JSON"))

    rels = data.get("relationships") or []
    rel_keys = set()
    for i, r in enumerate(rels):
        if not isinstance(r, dict):
            continue
        key = (
            r.get("teacher_email", "").lower(),
            r.get("student_code"),
            r.get("program"),
            r.get("academic_year"),
        )
        if key in rel_keys:
            errors.append(_err("relationships", "relationship", "Relació duplicada", i))
        rel_keys.add(key)

    for i, s in enumerate(students):
        if not isinstance(s, dict):
            continue
        gk = s.get("grade_key")
        if gk and not is_valid_grade_key(gk):
            errors.append(_err("students", "grade_key", f"Nivell invàlid: {gk}", i))

    return errors


async def validate_references(
    db: AsyncSession, org_id: str, data: dict
) -> list[dict]:
    errors: list[dict] = []
    warnings: list[str] = []

    year_titles_db = {
        r[0]
        for r in (
            await db.execute(
                select(AcademicYear.title).where(AcademicYear.organization_id == org_id)
            )
        ).all()
    }
    program_names_db = {
        r[0]
        for r in (
            await db.execute(select(Program.name).where(Program.organization_id == org_id))
        ).all()
    }
    school_abbr_db = {
        r[0]
        for r in (
            await db.execute(
                select(School.abbreviation).where(School.organization_id == org_id)
            )
        ).all()
    }
    teacher_emails_db = {
        r[0].lower()
        for r in (await db.execute(select(User.email).where(User.organization_id == org_id))).all()
    }
    student_codes_db = {
        r[0]
        for r in (
            await db.execute(
                select(Participant.code).where(Participant.organization_id == org_id)
            )
        ).all()
    }

    json_years = {y.get("title") for y in data.get("academic_years") or [] if isinstance(y, dict)}
    json_programs = {p.get("name") for p in data.get("programs") or [] if isinstance(p, dict)}
    json_schools = {s.get("abbreviation") for s in data.get("schools") or [] if isinstance(s, dict)}
    json_teachers = {
        t.get("email", "").lower() for t in data.get("teachers") or [] if isinstance(t, dict)
    }
    json_students = {s.get("code") for s in data.get("students") or [] if isinstance(s, dict)}

    all_years = year_titles_db | json_years
    all_programs = program_names_db | json_programs
    all_schools = school_abbr_db | json_schools
    all_teachers = teacher_emails_db | json_teachers
    all_students = student_codes_db | json_students

    for i, s in enumerate(data.get("students") or []):
        if not isinstance(s, dict):
            continue
        abbr = s.get("school_abbreviation")
        if abbr and abbr not in all_schools:
            warnings.append(f"L'escola '{abbr}' es crearà automàticament.")
        ay = s.get("academic_year")
        if ay and ay not in all_years:
            errors.append(_err("students", "academic_year", f"Any '{ay}' no resolt", i))
        prog = s.get("program")
        if prog and prog not in all_programs:
            errors.append(_err("students", "program", f"Programa '{prog}' no resolt", i))

    for i, r in enumerate(data.get("relationships") or []):
        if not isinstance(r, dict):
            continue
        te = r.get("teacher_email", "").lower()
        sc = r.get("student_code")
        pr = r.get("program")
        ay = r.get("academic_year")
        if te and te not in all_teachers:
            errors.append(_err("relationships", "teacher_email", f"Professor '{te}' no resolt", i))
        if sc and sc not in all_students:
            errors.append(_err("relationships", "student_code", f"Alumne '{sc}' no resolt", i))
        if pr and pr not in all_programs:
            errors.append(_err("relationships", "program", f"Programa '{pr}' no resolt", i))
        if ay and ay not in all_years:
            errors.append(_err("relationships", "academic_year", f"Any '{ay}' no resolt", i))

    return errors, warnings


async def preview_import(db: AsyncSession, org_id: str, data: dict) -> dict:
    struct_errors = validate_structure(data)
    if struct_errors:
        return {"errors": struct_errors, "warnings": []}

    ref_errors, warnings = await validate_references(db, org_id, data)

    year_titles_db = {
        r[0]
        for r in (
            await db.execute(
                select(AcademicYear.title).where(AcademicYear.organization_id == org_id)
            )
        ).all()
    }
    program_names_db = {
        r[0]
        for r in (
            await db.execute(select(Program.name).where(Program.organization_id == org_id))
        ).all()
    }
    school_abbr_db = {
        r[0]
        for r in (
            await db.execute(
                select(School.abbreviation).where(School.organization_id == org_id)
            )
        ).all()
    }
    teacher_emails_db = {
        r[0].lower()
        for r in (await db.execute(select(User.email).where(User.organization_id == org_id))).all()
    }
    student_codes_db = {
        r[0]
        for r in (
            await db.execute(
                select(Participant.code).where(Participant.organization_id == org_id)
            )
        ).all()
    }

    ay_new = sum(
        1 for y in data.get("academic_years") or []
        if isinstance(y, dict) and y.get("title") not in year_titles_db
    )
    prog_new = sum(
        1 for p in data.get("programs") or []
        if isinstance(p, dict) and p.get("name") not in program_names_db
    )
    sch_new = sum(
        1 for s in data.get("schools") or []
        if isinstance(s, dict) and s.get("abbreviation") not in school_abbr_db
    )
    teach_new = sum(
        1 for t in data.get("teachers") or []
        if isinstance(t, dict) and t.get("email", "").lower() not in teacher_emails_db
    )
    stud_new = sum(
        1 for s in data.get("students") or []
        if isinstance(s, dict) and s.get("code") not in student_codes_db
    )

    return {
        "academic_years": {"new": ay_new, "existing": len(data.get("academic_years") or []) - ay_new},
        "programs": {
            "new": prog_new,
            "existing": len(data.get("programs") or []) - prog_new,
        },
        "schools": {"new": sch_new, "existing": len(data.get("schools") or []) - sch_new},
        "teachers": {"new": teach_new, "existing": len(data.get("teachers") or []) - teach_new},
        "students": {"new": stud_new, "existing": len(data.get("students") or []) - stud_new},
        "relationships": {"new": len(data.get("relationships") or []), "skipped": 0},
        "errors": ref_errors,
        "warnings": warnings,
    }


async def commit_import(
    db: AsyncSession,
    org_id: str,
    user_id: str,
    data: dict,
    source_filename: str | None = None,
) -> dict:
    errors = validate_structure(data)
    if errors:
        return {"status": "failed", "errors": errors}

    ref_errors, _ = await validate_references(db, org_id, data)
    if ref_errors:
        return {"status": "failed", "errors": ref_errors}

    from datetime import date

    org_result = await db.execute(select(Organization).where(Organization.id == org_id))
    org = org_result.scalar_one()

    year_by_title: dict[str, str] = {}
    for row in (
        await db.execute(select(AcademicYear).where(AcademicYear.organization_id == org_id))
    ).scalars().all():
        year_by_title[row.title] = row.id

    for item in data.get("academic_years") or []:
        if not isinstance(item, dict) or item.get("title") in year_by_title:
            continue
        y = AcademicYear(
            organization_id=org_id,
            title=item["title"],
            start_date=date.fromisoformat(item["start_date"]),
            end_date=date.fromisoformat(item["end_date"]),
        )
        db.add(y)
        await db.flush()
        year_by_title[y.title] = y.id

    program_by_name: dict[str, str] = {}
    for row in (
        await db.execute(select(Program).where(Program.organization_id == org_id))
    ).scalars().all():
        program_by_name[row.name] = row.id

    for item in data.get("programs") or []:
        if not isinstance(item, dict) or item.get("name") in program_by_name:
            continue
        p = Program(
            organization_id=org_id,
            name=item["name"],
            description=item.get("description"),
            program_type=item.get("program_type", "other"),
            start_date=date.today(),
        )
        db.add(p)
        await db.flush()
        program_by_name[p.name] = p.id

    school_by_abbr: dict[str, str] = {}
    for row in (
        await db.execute(select(School).where(School.organization_id == org_id))
    ).scalars().all():
        school_by_abbr[row.abbreviation] = row.id

    for item in data.get("schools") or []:
        if not isinstance(item, dict) or item.get("abbreviation") in school_by_abbr:
            continue
        s = School(
            organization_id=org_id,
            name=item["name"],
            abbreviation=item["abbreviation"],
        )
        db.add(s)
        await db.flush()
        school_by_abbr[s.abbreviation] = s.id

    teacher_passwords: list[dict] = []
    user_by_email: dict[str, str] = {}
    for row in (
        await db.execute(select(User).where(User.organization_id == org_id))
    ).scalars().all():
        user_by_email[row.email.lower()] = row.id

    commit_errors: list[dict] = []
    for i, item in enumerate(data.get("teachers") or []):
        if not isinstance(item, dict):
            continue
        email = item.get("email", "").lower()
        if email in user_by_email:
            commit_errors.append(_err("teachers", "email", f"Email ja existeix: {email}", i))
            continue
        pwd = _temp_password()
        u = User(
            organization_id=org_id,
            email=email,
            hashed_password=get_password_hash(pwd),
            full_name=item.get("full_name", email),
            role="professional",
            is_active=True,
        )
        db.add(u)
        await db.flush()
        user_by_email[email] = u.id
        teacher_passwords.append({"email": email, "full_name": u.full_name, "password": pwd})

    if commit_errors:
        await db.rollback()
        return {"status": "failed", "errors": commit_errors}

    participant_by_code: dict[str, str] = {}
    for row in (
        await db.execute(select(Participant).where(Participant.organization_id == org_id))
    ).scalars().all():
        participant_by_code[row.code] = row.id

    for i, item in enumerate(data.get("students") or []):
        if not isinstance(item, dict):
            continue
        code = item.get("code")
        if code in participant_by_code:
            commit_errors.append(_err("students", "code", f"Codi ja existeix: {code}", i))
            continue
        abbr = item.get("school_abbreviation")
        school_id = school_by_abbr.get(abbr)
        if not school_id:
            commit_errors.append(_err("students", "school_abbreviation", f"Escola no trobada: {abbr}", i))
            continue

        p = Participant(
            organization_id=org_id,
            school_id=school_id,
            code=code,
            first_name=item.get("first_name", code),
            birth_year=item.get("birth_year"),
            gender=item.get("gender", "unknown"),
            nationality=item.get("nationality"),
            enrollment_date=date.today(),
        )
        db.add(p)
        await db.flush()
        participant_by_code[code] = p.id

        gk = item.get("grade_key")
        ay_title = item.get("academic_year")
        if gk and ay_title and ay_title in year_by_title:
            label = label_for_key(gk) or gk
            p.current_grade_key = gk
            p.current_grade_label = label
            db.add(
                ParticipantGradeHistory(
                    participant_id=p.id,
                    academic_year_id=year_by_title[ay_title],
                    grade_key=gk,
                    grade_label=label,
                )
            )

        prog_name = item.get("program")
        if prog_name and prog_name in program_by_name:
            ay_id = year_by_title.get(ay_title) if ay_title else None
            db.add(
                ProgramEnrollment(
                    program_id=program_by_name[prog_name],
                    participant_id=p.id,
                    academic_year_id=ay_id,
                    enrolled_at=date.today(),
                )
            )

    if commit_errors:
        await db.rollback()
        return {"status": "failed", "errors": commit_errors}

    rel_created = 0
    rel_skipped = 0
    for item in data.get("relationships") or []:
        if not isinstance(item, dict):
            continue
        uid = user_by_email.get(item.get("teacher_email", "").lower())
        pid = participant_by_code.get(item.get("student_code"))
        prid = program_by_name.get(item.get("program"))
        ayid = year_by_title.get(item.get("academic_year"))
        if not all([uid, pid, prid, ayid]):
            continue

        existing = await db.execute(
            select(TeachingAssignment).where(
                TeachingAssignment.user_id == uid,
                TeachingAssignment.participant_id == pid,
                TeachingAssignment.program_id == prid,
                TeachingAssignment.academic_year_id == ayid,
            )
        )
        if existing.scalar_one_or_none():
            rel_skipped += 1
            continue

        part_q = await db.execute(select(Participant).where(Participant.id == pid))
        part = part_q.scalar_one()
        db.add(
            TeachingAssignment(
                user_id=uid,
                participant_id=pid,
                program_id=prid,
                academic_year_id=ayid,
                school_id=part.school_id,
                source="import_json",
            )
        )
        ua = await db.execute(
            select(UserParticipantAssignment).where(
                UserParticipantAssignment.user_id == uid,
                UserParticipantAssignment.participant_id == pid,
            )
        )
        if not ua.scalar_one_or_none():
            db.add(UserParticipantAssignment(user_id=uid, participant_id=pid))
        rel_created += 1

    summary = {
        "years": len(data.get("academic_years") or []),
        "programs": len(data.get("programs") or []),
        "schools": len(data.get("schools") or []),
        "teachers_created": len(teacher_passwords),
        "students_created": len(data.get("students") or []) - len(commit_errors),
        "relationships_created": rel_created,
        "relationships_skipped": rel_skipped,
        "teacher_passwords": teacher_passwords,
    }

    raw_hash = hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()
    log = ImportLog(
        organization_id=org_id,
        imported_by=user_id,
        source_filename=source_filename,
        summary_json=json.dumps(summary),
        status="completed",
        raw_input_hash=raw_hash,
    )
    db.add(log)
    await db.commit()

    return {"status": "completed", "summary": summary}
