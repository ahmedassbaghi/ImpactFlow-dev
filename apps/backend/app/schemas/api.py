from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, EmailStr, Field


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    role: str
    user_id: str


class LoginRequest(BaseModel):
    login: str = Field(min_length=3, max_length=255, description="Email o nom d'usuari")
    password: str


class RegisterRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=2, max_length=120)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9._]+$")
    password: str = Field(min_length=4, max_length=128)
    organization_slug: str = "narinan"


class RegisterResponse(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    username: str
    message: str


class SchoolCreate(BaseModel):
    name: str
    abbreviation: str = Field(min_length=2, max_length=6, pattern=r"^[A-Z0-9]+$")


class SchoolUpdate(BaseModel):
    name: Optional[str] = None
    abbreviation: Optional[str] = Field(default=None, min_length=2, max_length=6, pattern=r"^[A-Z0-9]+$")
    active: Optional[bool] = None


class SchoolOut(BaseModel):
    id: str
    name: str
    abbreviation: str
    active: bool
    participant_count: int = 0

    class Config:
        from_attributes = True


class ParticipantCreate(BaseModel):
    program_id: Optional[str] = None
    school_id: str
    code: Optional[str] = None
    first_name: str
    birth_year: Optional[int] = None
    gender: str = "unknown"
    nationality: Optional[str] = None
    enrollment_date: date
    consent_given: bool = False
    is_control_group: bool = False


class ParticipantUpdate(BaseModel):
    school_id: Optional[str] = None
    first_name: Optional[str] = None
    code: Optional[str] = None
    birth_year: Optional[int] = None
    gender: Optional[str] = None
    nationality: Optional[str] = None
    active: Optional[bool] = None


class ParticipantOut(BaseModel):
    id: str
    code: str
    first_name: str
    nationality: Optional[str]
    enrollment_date: date
    is_control_group: bool
    active: bool
    school_id: str
    school_name: Optional[str] = None
    school_abbreviation: Optional[str] = None

    class Config:
        from_attributes = True


class FollowUpAssessmentInput(BaseModel):
    participant_id: str
    program_id: str
    assessment_date: date
    period_label: str = "seguiment"
    academic_score: Optional[int] = Field(default=None, ge=0, le=10)
    cognitive_score: Optional[int] = Field(default=None, ge=0, le=10)
    social_score: Optional[int] = Field(default=None, ge=0, le=10)
    integration_score: Optional[int] = Field(default=None, ge=0, le=10)
    notes: Optional[str] = None


class UserAssignmentUpdate(BaseModel):
    participant_ids: list[str]


class OrganizationSettingsOut(BaseModel):
    participant_code_pattern: str


class OrganizationSettingsUpdate(BaseModel):
    participant_code_pattern: str = Field(min_length=3, max_length=80)


class ProgramCreate(BaseModel):
    name: str
    description: Optional[str] = None
    program_type: str = "other"
    start_date: date
    end_date: Optional[date] = None


class ProgramOut(BaseModel):
    id: str
    name: str
    description: Optional[str]
    program_type: str
    start_date: date
    end_date: Optional[date]
    active: bool

    class Config:
        from_attributes = True


class AssessmentInput(BaseModel):
    participant_id: str
    program_id: str
    assessment_date: date
    period_label: Optional[str] = None
    reading_level: Optional[int] = Field(default=None, ge=1, le=5)
    math_level: Optional[int] = Field(default=None, ge=1, le=5)
    comprehension_level: Optional[int] = Field(default=None, ge=1, le=5)
    attention_level: Optional[int] = Field(default=None, ge=1, le=5)
    memory_level: Optional[int] = Field(default=None, ge=1, le=5)
    autonomy_level: Optional[int] = Field(default=None, ge=1, le=5)
    peer_interaction: Optional[int] = Field(default=None, ge=1, le=5)
    group_work: Optional[int] = Field(default=None, ge=1, le=5)
    emotional_regulation: Optional[int] = Field(default=None, ge=1, le=5)
    language_fluency: Optional[int] = Field(default=None, ge=1, le=5)
    cultural_adaptation: Optional[int] = Field(default=None, ge=1, le=5)
    notes: Optional[str] = None


class SessionGoalProgressInput(BaseModel):
    """GAS-style progress on an individualized micro-goal in this session.
    Range -2..+2: much worse / worse / expected / better / much better."""
    micro_goal_id: str
    progress: int = Field(ge=-2, le=2)
    note: Optional[str] = None


class SessionObservationInput(BaseModel):
    participant_id: str
    academic_score: Optional[int] = Field(default=None, ge=1, le=5)
    cognitive_score: Optional[int] = Field(default=None, ge=1, le=5)
    social_score: Optional[int] = Field(default=None, ge=1, le=5)
    integration_score: Optional[int] = Field(default=None, ge=1, le=5)
    qualitative_note: Optional[str] = None
    mood_indicator: Optional[str] = None
    attendance_status: str = "present"
    # Bespoke behavioural signals — all optional, backward compatible.
    arrival_mood: Optional[str] = None
    departure_mood: Optional[str] = None
    verbal_participation: Optional[int] = Field(default=None, ge=0, le=3)
    time_on_task_pct: Optional[int] = Field(default=None, ge=0, le=100)
    flag_alert: bool = False
    self_eval_emoji: Optional[str] = None
    volunteer_progress_sense: Optional[str] = Field(
        default=None,
        description="Volunteer perception vs last session: progressed | similar | step_back",
    )
    goal_progress: list[SessionGoalProgressInput] = []


class ParticipantEnrollIn(BaseModel):
    participant_id: str


class SessionMicroGoalCompletionInput(BaseModel):
    goal_id: str
    note: Optional[str] = None


class SessionCreate(BaseModel):
    program_id: str
    session_date: date
    session_time: Optional[str] = Field(
        default=None,
        pattern=r"^([01]\d|2[0-3]):[0-5]\d$",
        description="Hora de la sessió en format 24h HH:MM",
    )
    session_type: str = "group"
    duration_minutes: Optional[int] = None
    notes: Optional[str] = None
    observations: list[SessionObservationInput]
    micro_goal_completions: list[SessionMicroGoalCompletionInput] = []
    activity_tag_ids: list[str] = []


class SessionOut(BaseModel):
    id: str
    program_id: str
    session_date: date
    session_time: Optional[str] = None
    session_type: str
    duration_minutes: Optional[int]
    notes: Optional[str]
    notes_ai_summary: Optional[str]
    notes_sentiment: Optional[float]
    activity_tag_ids: list[str] = []

    class Config:
        from_attributes = True


class SessionParticipantBrief(BaseModel):
    id: str
    first_name: str
    code: str


class SessionListOut(SessionOut):
    participants: list[SessionParticipantBrief] = []


class SessionGoalProgressOut(BaseModel):
    micro_goal_id: str
    progress: int
    note: Optional[str] = None

    class Config:
        from_attributes = True


class SessionObservationOut(BaseModel):
    id: str
    participant_id: str
    academic_score: Optional[int]
    cognitive_score: Optional[int]
    social_score: Optional[int]
    integration_score: Optional[int]
    qualitative_note: Optional[str]
    mood_indicator: Optional[str]
    arrival_mood: Optional[str] = None
    departure_mood: Optional[str] = None
    verbal_participation: Optional[int] = None
    time_on_task_pct: Optional[int] = None
    flag_alert: bool = False
    self_eval_emoji: Optional[str] = None
    goal_progress: list[SessionGoalProgressOut] = []

    class Config:
        from_attributes = True


class SessionActivityTagOut(BaseModel):
    id: str
    slug: str
    label: str
    color: Optional[str] = None
    dimensions: list[str] = []
    active: bool = True

    class Config:
        from_attributes = True


class SessionActivityTagCreate(BaseModel):
    slug: str = Field(min_length=2, max_length=64, pattern=r"^[a-z0-9_]+$")
    label: str = Field(min_length=1, max_length=120)
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    dimensions: list[str] = []


class SessionActivityTagUpdate(BaseModel):
    label: Optional[str] = None
    color: Optional[str] = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")
    dimensions: Optional[list[str]] = None
    active: Optional[bool] = None


class IndividualMicroGoalCreate(BaseModel):
    participant_id: str
    program_id: str
    title: str = Field(min_length=1, max_length=160)
    description: Optional[str] = None
    dimension: str = Field(pattern=r"^(academic|cognitive|social|integration)$")
    difficulty: int = Field(default=1, ge=1, le=3)
    target_date: Optional[date] = None


class IndividualMicroGoalOut(BaseModel):
    id: str
    participant_id: str
    program_id: str
    title: str
    description: Optional[str]
    dimension: str
    difficulty: int
    target_date: Optional[date]
    active: bool

    class Config:
        from_attributes = True


class MicroGoalCreate(BaseModel):
    program_id: str
    title: str
    description: Optional[str] = None
    dimension: str
    difficulty: int = Field(default=1, ge=1, le=3)
    target_date: Optional[date] = None


class MicroGoalOut(BaseModel):
    id: str
    program_id: str
    title: str
    description: Optional[str]
    dimension: str
    difficulty: int
    target_date: Optional[date]
    active: bool
    created_at: datetime
    completions_count: int = 0
    last_completed_at: Optional[datetime] = None


class ReportRequest(BaseModel):
    program_id: str
    report_type: str = "quarterly"
    period_start: date
    period_end: date
    title: str


class ReportStatus(BaseModel):
    id: str
    status: str
    created_at: datetime


class ReportListItem(BaseModel):
    id: str
    title: str
    status: str
    report_type: str
    period_start: date
    period_end: date
    created_at: datetime
    created_by_name: str
    program_id: Optional[str] = None
    program_name: Optional[str] = None


class ParseNoteRequest(BaseModel):
    note_text: str
    participant_context: Optional[dict] = None


class UserCreateRequest(BaseModel):
    email: EmailStr
    full_name: str
    role: str
    password: str = Field(min_length=6)
    username: Optional[str] = None


class UserActivateRequest(BaseModel):
    role: str = Field(pattern="^(coordinator|professional)$")
    is_active: bool = True


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    username: Optional[str] = None
    role: str
    is_active: bool

    class Config:
        from_attributes = True


class PlanUpdateRequest(BaseModel):
    plan: str = Field(pattern="^(free|starter|pro|enterprise)$")


class LandingContentUpdate(BaseModel):
    landing_content: str
