from __future__ import annotations

from datetime import date, datetime
from typing import Optional
from uuid import uuid4

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return uuid4().hex


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String, nullable=False)
    slug: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    logo_url: Mapped[Optional[str]] = mapped_column(String)
    plan: Mapped[str] = mapped_column(String, default="free")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    full_name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    organization: Mapped[Organization] = relationship()


class Program(Base):
    __tablename__ = "programs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    program_type: Mapped[str] = mapped_column(String, default="other")
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[Optional[date]] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class Participant(Base):
    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    code: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    first_name: Mapped[str] = mapped_column(String, nullable=False)
    birth_year: Mapped[Optional[int]] = mapped_column(Integer)
    gender: Mapped[str] = mapped_column(String, default="unknown")
    nationality: Mapped[Optional[str]] = mapped_column(String)
    enrollment_date: Mapped[date] = mapped_column(Date, nullable=False)
    consent_given: Mapped[bool] = mapped_column(Boolean, default=False)
    is_control_group: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProgramEnrollment(Base):
    """Explicit many-to-many: participant enrolled in a program."""
    __tablename__ = "program_enrollments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    enrolled_at: Mapped[date] = mapped_column(Date, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (UniqueConstraint("program_id", "participant_id"),)


class BaselineAssessment(Base):
    __tablename__ = "baseline_assessments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    assessed_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    assessment_date: Mapped[date] = mapped_column(Date, nullable=False)
    reading_level: Mapped[Optional[int]] = mapped_column(Integer)
    math_level: Mapped[Optional[int]] = mapped_column(Integer)
    comprehension_level: Mapped[Optional[int]] = mapped_column(Integer)
    attention_level: Mapped[Optional[int]] = mapped_column(Integer)
    memory_level: Mapped[Optional[int]] = mapped_column(Integer)
    autonomy_level: Mapped[Optional[int]] = mapped_column(Integer)
    peer_interaction: Mapped[Optional[int]] = mapped_column(Integer)
    group_work: Mapped[Optional[int]] = mapped_column(Integer)
    emotional_regulation: Mapped[Optional[int]] = mapped_column(Integer)
    language_fluency: Mapped[Optional[int]] = mapped_column(Integer)
    cultural_adaptation: Mapped[Optional[int]] = mapped_column(Integer)
    ipi_baseline: Mapped[Optional[float]] = mapped_column(Float)
    notes: Mapped[Optional[str]] = mapped_column(Text)

    __table_args__ = (UniqueConstraint("participant_id", "program_id"),)


class PeriodicAssessment(Base):
    __tablename__ = "periodic_assessments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    assessed_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    assessment_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_label: Mapped[str] = mapped_column(String, nullable=False)
    reading_level: Mapped[Optional[int]] = mapped_column(Integer)
    math_level: Mapped[Optional[int]] = mapped_column(Integer)
    comprehension_level: Mapped[Optional[int]] = mapped_column(Integer)
    attention_level: Mapped[Optional[int]] = mapped_column(Integer)
    memory_level: Mapped[Optional[int]] = mapped_column(Integer)
    autonomy_level: Mapped[Optional[int]] = mapped_column(Integer)
    peer_interaction: Mapped[Optional[int]] = mapped_column(Integer)
    group_work: Mapped[Optional[int]] = mapped_column(Integer)
    emotional_regulation: Mapped[Optional[int]] = mapped_column(Integer)
    language_fluency: Mapped[Optional[int]] = mapped_column(Integer)
    cultural_adaptation: Mapped[Optional[int]] = mapped_column(Integer)
    ipi_score: Mapped[float] = mapped_column(Float, nullable=False)
    ipi_delta_vs_baseline: Mapped[Optional[float]] = mapped_column(Float)
    ipi_delta_vs_previous: Mapped[Optional[float]] = mapped_column(Float)
    predicted_next_ipi: Mapped[Optional[float]] = mapped_column(Float)
    risk_score: Mapped[Optional[float]] = mapped_column(Float)
    risk_level: Mapped[Optional[str]] = mapped_column(String)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    professional_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    session_date: Mapped[date] = mapped_column(Date, nullable=False)
    session_type: Mapped[str] = mapped_column(String, default="group")
    duration_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    notes: Mapped[Optional[str]] = mapped_column(Text)
    notes_ai_summary: Mapped[Optional[str]] = mapped_column(Text)
    notes_sentiment: Mapped[Optional[float]] = mapped_column(Float)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class SessionObservation(Base):
    __tablename__ = "session_observations"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    session_id: Mapped[str] = mapped_column(ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    academic_score: Mapped[Optional[int]] = mapped_column(Integer)
    cognitive_score: Mapped[Optional[int]] = mapped_column(Integer)
    social_score: Mapped[Optional[int]] = mapped_column(Integer)
    integration_score: Mapped[Optional[int]] = mapped_column(Integer)
    qualitative_note: Mapped[Optional[str]] = mapped_column(Text)
    qualitative_note_parsed_tags: Mapped[Optional[str]] = mapped_column(Text)
    mood_indicator: Mapped[Optional[str]] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    __table_args__ = (UniqueConstraint("session_id", "participant_id"),)


class AttendanceRecord(Base):
    __tablename__ = "attendance_records"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sessions.id"))
    date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False)


class MicroGoal(Base):
    __tablename__ = "micro_goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    participant_id: Mapped[str] = mapped_column(ForeignKey("participants.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    dimension: Mapped[str] = mapped_column(String, nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    points: Mapped[int] = mapped_column(Integer, default=10)
    target_date: Mapped[Optional[date]] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class MicroGoalCompletion(Base):
    __tablename__ = "micro_goal_completions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    micro_goal_id: Mapped[str] = mapped_column(ForeignKey("micro_goals.id", ondelete="CASCADE"), nullable=False)
    session_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sessions.id"))
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    verified_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    note: Mapped[Optional[str]] = mapped_column(Text)


class ProgramMicroGoal(Base):
    __tablename__ = "program_micro_goals"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    program_id: Mapped[str] = mapped_column(ForeignKey("programs.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text)
    dimension: Mapped[str] = mapped_column(String, nullable=False)
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    target_date: Mapped[Optional[date]] = mapped_column(Date)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class ProgramMicroGoalCompletion(Base):
    __tablename__ = "program_micro_goal_completions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    program_micro_goal_id: Mapped[str] = mapped_column(
        ForeignKey("program_micro_goals.id", ondelete="CASCADE"), nullable=False
    )
    session_id: Mapped[Optional[str]] = mapped_column(ForeignKey("sessions.id"))
    completed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    verified_by: Mapped[Optional[str]] = mapped_column(ForeignKey("users.id"))
    note: Mapped[Optional[str]] = mapped_column(Text)


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False)
    program_id: Mapped[Optional[str]] = mapped_column(ForeignKey("programs.id"))
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    report_type: Mapped[str] = mapped_column(String, nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    content_json: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String, default="ready")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
