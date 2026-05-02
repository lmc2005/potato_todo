from __future__ import annotations

from pydantic import BaseModel, Field


class RegisterInput(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=255)
    confirm_password: str = Field(min_length=8, max_length=255)


class LoginInput(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=255)


class AuthUserOut(BaseModel):
    id: int
    email: str


class AuthSessionOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: AuthUserOut
