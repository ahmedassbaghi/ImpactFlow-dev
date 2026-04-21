from sqlalchemy import Column, String, DateTime, Enum
from app.database import Base
from datetime import datetime
import enum
import uuid

class PlanEnum(str, enum.Enum):
    free = 'free'
    starter = 'starter'
    pro = 'pro'
    enterprise = 'enterprise'

class Organization(Base):
    __tablename__ = "organizations"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    slug = Column(String, unique=True, nullable=False)
    logo_url = Column(String, nullable=True)
    plan = Column(String, default=PlanEnum.free.value)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
