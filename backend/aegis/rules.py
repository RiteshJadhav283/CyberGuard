from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class Schedule(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: str = Field(min_length=1,max_length=256)
    weekdays: list[int] = Field(min_length=1,max_length=7)
    start_minute_utc: int = Field(ge=0,lt=1440)
    end_minute_utc: int = Field(gt=0,le=1440)

    @model_validator(mode="after")
    def valid(self):
        if self.start_minute_utc>=self.end_minute_utc or any(d not in range(7) for d in self.weekdays):
            raise ValueError("Use a UTC interval within one day and weekdays 0 (Monday) through 6")
        return self


class Rules(BaseModel):
    model_config = ConfigDict(extra="forbid")
    bulk_enabled: bool = False
    threshold: int = Field(default=10,ge=2,le=1000)
    window_seconds: int = Field(default=300,ge=5,le=3600)
    automatic_triggers: list[Literal["canary","rolling_bulk"]] = Field(default_factory=list,max_length=2)
    ttl_seconds: int = Field(default=900,ge=60,le=3600)
    exempt_roles: list[str] = Field(default_factory=list,max_length=100)
    scheduled_jobs: list[Schedule] = Field(default_factory=list,max_length=50)

    @model_validator(mode="after")
    def triggers(self):
        if "rolling_bulk" in self.automatic_triggers and not self.bulk_enabled:
            raise ValueError("Enable the rolling rule before enabling its automatic response")
        return self
